import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';

import { MAX_IMAGE_BYTES } from '@shared/limits';

import { AppButton, AppText } from '@/components';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTheme } from '@/theme';

import { loadProducers } from './loadProducers';
import type { UploadPreview } from './produce';

interface UploadPaneProps {
  uri: string | null;
  onPick: (uri: string, suggestedThreshold: number) => void;
  threshold: number;
  onChangeThreshold: (threshold: number) => void;
  onError: (message: string) => void;
}

type Prepared = Awaited<ReturnType<Awaited<ReturnType<typeof loadProducers>>['prepareUpload']>>;

/** Photo of a signature → crop (system picker) → threshold slider with a checkerboard preview. */
export function UploadPane({ uri, onPick, threshold, onChangeThreshold, onError }: UploadPaneProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [prepared, setPrepared] = useState<{ uri: string; value: Prepared } | null>(null);
  const [busy, setBusy] = useState(false);
  const debounced = useDebouncedValue(threshold, 60);

  const pick = async (camera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    };
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      onError(t('signatures.fileTooLarge'));
      return;
    }
    setBusy(true);
    try {
      const { prepareUpload } = await loadProducers();
      const value = await prepareUpload(asset.uri);
      setPrepared({ uri: asset.uri, value });
      onPick(asset.uri, value.suggestedThreshold);
    } catch {
      onError(t('errors.FILE_UNSUPPORTED'));
    } finally {
      setBusy(false);
    }
  };

  const current = prepared && prepared.uri === uri ? prepared.value : null;
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  useEffect(() => {
    if (!current) return;
    // Thresholding a 480 px preview takes a few ms; run it after the slider settles briefly.
    const handle = setTimeout(() => setPreview(current.preview(debounced)), 0);
    return () => clearTimeout(handle);
  }, [current, debounced]);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <AppText variant="footnote" color="textSecondary">
        {t('signatures.uploadHint')}
      </AppText>
      <View style={styles.row}>
        <AppButton
          title={t('signatures.uploadChoose')}
          icon="images"
          variant="secondary"
          onPress={() => void pick(false)}
          testID="upload-choose"
        />
        {Platform.OS !== 'web' ? (
          <AppButton
            title={t('signatures.uploadCamera')}
            icon="camera"
            variant="secondary"
            onPress={() => void pick(true)}
            testID="upload-camera"
          />
        ) : null}
      </View>
      {busy ? <ActivityIndicator color={theme.colors.textSecondary} /> : null}
      {current && preview ? (
        <>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('signatures.previewLabel')}
            style={[
              styles.checker,
              { borderRadius: theme.radius.md, aspectRatio: preview.width / preview.height },
            ]}
          >
            <Checkerboard />
            <Image source={{ uri: preview.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          </View>
          <View>
            <AppText variant="subhead">{t('signatures.thresholdLabel')}</AppText>
            <Slider
              minimumValue={40}
              maximumValue={250}
              step={1}
              value={threshold}
              onValueChange={onChangeThreshold}
              accessibilityLabel={t('signatures.thresholdLabel')}
              accessibilityHint={t('signatures.thresholdHint')}
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor={theme.colors.border}
              thumbTintColor={theme.colors.primary}
              testID="upload-threshold"
            />
            <AppText variant="footnote" color="textSecondary">
              {t('signatures.thresholdHint')}
            </AppText>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Grey/white squares, the usual way to show transparency. */
function Checkerboard() {
  const cells = 12;
  return (
    <View style={StyleSheet.absoluteFill}>
      {Array.from({ length: cells }, (_, row) => (
        <View key={row} style={styles.checkerRow}>
          {Array.from({ length: cells * 3 }, (_, col) => (
            <View
              key={col}
              style={[styles.cell, { backgroundColor: (row + col) % 2 ? '#FFFFFF' : '#E3E6EA' }]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checker: { width: '100%', overflow: 'hidden', maxHeight: 220 },
  checkerRow: { flex: 1, flexDirection: 'row' },
  cell: { flex: 1 },
});
