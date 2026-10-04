import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { AppError } from '@shared/errors';

import {
  AppButton,
  AppText,
  Card,
  IconButton,
  InlineAlert,
  ListRow,
  ProgressBar,
  Screen,
} from '@/components';
import { titleFromFileName } from '@/features/documents/api';
import { invalidateDocumentData } from '@/features/documents/hooks';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';

import { isScannerAvailable, pickImages, pickPdf, scanDocument, type PickedImage } from '../pickers';
import { UploadAbortedError } from '../resumable';
import { uploadImagesDocument, uploadPdfDocument, type UploadStage } from '../uploadDocument';

type Working = { stage: UploadStage; progress: number };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SourceScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const queryClient = useQueryClient();
  // ?documentId=… resumes an existing draft whose upload never completed.
  const params = useLocalSearchParams<{ documentId?: string }>();
  const draftId = useRef<string | undefined>(params.documentId);
  const abort = useRef<AbortController | null>(null);

  const [images, setImages] = useState<PickedImage[] | null>(null);
  const [imageTitle, setImageTitle] = useState('');
  const [working, setWorking] = useState<Working | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; message: string } | null>(null);

  const run = async (
    task: (cb: Parameters<typeof uploadPdfDocument>[2]) => Promise<{ documentId: string }>,
  ) => {
    setNotice(null);
    abort.current = new AbortController();
    setWorking({ stage: 'preparing', progress: 0 });
    try {
      const result = await task({
        documentId: draftId.current,
        signal: abort.current.signal,
        onDraftCreated: (id) => {
          draftId.current = id;
        },
        onStage: (stage) => setWorking((w) => ({ stage, progress: w?.progress ?? 0 })),
        onProgress: (progress) => setWorking((w) => ({ stage: w?.stage ?? 'uploading', progress })),
      });
      await invalidateDocumentData(queryClient);
      router.replace({ pathname: '/documents/new/details', params: { id: result.documentId } });
    } catch (error) {
      void invalidateDocumentData(queryClient); // the draft exists even when the upload failed
      if (error instanceof UploadAbortedError) setNotice({ tone: 'info', message: t('upload.cancelled') });
      else setNotice({ tone: 'error', message: errorMessage(error) });
    } finally {
      setWorking(null);
      abort.current = null;
    }
  };

  const choosePdf = async () => {
    try {
      const pdf = await pickPdf();
      if (pdf)
        await run((cb) => uploadPdfDocument(pdf, titleFromFileName(pdf.name, t('upload.untitled')), cb));
    } catch (error) {
      setNotice({ tone: 'error', message: errorMessage(error) });
    }
  };

  const chooseImages = async (source: 'scan' | 'photos') => {
    try {
      const picked = source === 'scan' ? await scanDocument() : await pickImages();
      if (!picked) return;
      if (picked.length > 30) throw new AppError('FILE_TOO_LARGE');
      setImages(picked);
      setImageTitle(t(source === 'scan' ? 'upload.scanTitle' : 'upload.photosTitle', { date: today() }));
    } catch (error) {
      setNotice({ tone: 'error', message: errorMessage(error) });
    }
  };

  const move = (index: number, delta: -1 | 1) =>
    setImages((list) => {
      if (!list) return list;
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  const stageLabel = working
    ? working.stage === 'uploading'
      ? t('upload.stageUploading', { percent: Math.round(working.progress * 100) })
      : working.stage === 'processing'
        ? t('upload.stageProcessing')
        : t('upload.stagePreparing')
    : '';

  return (
    <Screen scroll edges={['bottom']}>
      <AppText variant="footnote" color="textSecondary" style={styles.step}>
        {t('upload.stepSource')}
      </AppText>
      <AppText variant="title2" accessibilityRole="header">
        {t('upload.sourceTitle')}
      </AppText>
      <AppText variant="callout" color="textSecondary" style={styles.subtitle}>
        {t('upload.sourceSubtitle')}
      </AppText>

      {notice ? <InlineAlert message={notice.message} tone={notice.tone} testID="upload-notice" /> : null}

      {working ? (
        <Card style={styles.working} testID="upload-working">
          <AppText variant="headline" accessibilityLiveRegion="polite">
            {stageLabel}
          </AppText>
          <ProgressBar
            value={working.stage === 'uploading' ? working.progress : null}
            accessibilityLabel={stageLabel}
            testID="upload-progress"
          />
          {working.stage !== 'processing' ? (
            <AppButton
              title={t('upload.cancelUpload')}
              variant="ghost"
              onPress={() => abort.current?.abort()}
              testID="upload-cancel"
            />
          ) : null}
        </Card>
      ) : images ? (
        <View style={styles.review}>
          <AppText variant="headline">{t('upload.selectedImages', { count: images.length })}</AppText>
          <Card padded={false}>
            {images.map((image, index) => (
              <View
                key={`${image.uri}-${index}`}
                style={[
                  styles.imageRow,
                  index < images.length - 1
                    ? { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
                    : null,
                ]}
              >
                <Image
                  source={{ uri: image.uri }}
                  style={[styles.thumb, { borderRadius: theme.radius.sm }]}
                  accessibilityIgnoresInvertColors
                />
                <AppText
                  variant="body"
                  style={styles.imageLabel}
                  accessibilityLabel={t('common.itemPosition', { position: index + 1, total: images.length })}
                >
                  {t('upload.imageLabel', { position: index + 1 })}
                </AppText>
                <IconButton
                  icon="arrow-up"
                  accessibilityLabel={`${t('common.moveUp')}, ${t('upload.imageLabel', { position: index + 1 })}`}
                  onPress={index > 0 ? () => move(index, -1) : undefined}
                  color={index > 0 ? 'primary' : 'textTertiary'}
                />
                <IconButton
                  icon="arrow-down"
                  accessibilityLabel={`${t('common.moveDown')}, ${t('upload.imageLabel', { position: index + 1 })}`}
                  onPress={index < images.length - 1 ? () => move(index, 1) : undefined}
                  color={index < images.length - 1 ? 'primary' : 'textTertiary'}
                />
                <IconButton
                  icon="trash-outline"
                  color="danger"
                  accessibilityLabel={t('upload.removeImage', { position: index + 1 })}
                  onPress={() =>
                    setImages((l) => (l && l.length > 1 ? l.filter((_, i) => i !== index) : null))
                  }
                />
              </View>
            ))}
          </Card>
          <AppButton
            title={t('upload.createFromImages')}
            icon="document-outline"
            onPress={() => {
              const selected = images;
              void run((cb) => uploadImagesDocument(selected, imageTitle || t('upload.untitled'), cb));
            }}
            testID="upload-create-pdf"
          />
          <AppButton title={t('common.cancel')} variant="ghost" onPress={() => setImages(null)} />
        </View>
      ) : (
        <Card padded={false}>
          <ListRow
            title={t('upload.choosePdf')}
            subtitle={t('upload.choosePdfHint')}
            left={<Ionicons name="document-attach-outline" size={24} color={theme.colors.primary} />}
            onPress={() => void choosePdf()}
            separator
            testID="upload-choose-pdf"
          />
          <ListRow
            title={t('upload.scan')}
            subtitle={isScannerAvailable() ? t('upload.scanHint') : t('upload.scanUnavailable')}
            left={<Ionicons name="scan-outline" size={24} color={theme.colors.primary} />}
            onPress={isScannerAvailable() ? () => void chooseImages('scan') : undefined}
            disabled={!isScannerAvailable()}
            separator
            testID="upload-scan"
          />
          <ListRow
            title={t('upload.photos')}
            subtitle={t('upload.photosHint')}
            left={<Ionicons name="images-outline" size={24} color={theme.colors.primary} />}
            onPress={() => void chooseImages('photos')}
            testID="upload-photos"
          />
        </Card>
      )}

      <AppText variant="footnote" color="textSecondary" style={styles.limits}>
        {t('upload.limits')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { marginTop: 16, marginBottom: 4 },
  subtitle: { marginTop: 4, marginBottom: 20 },
  working: { gap: 14 },
  review: { gap: 12 },
  imageRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingVertical: 6, gap: 4 },
  thumb: { width: 44, height: 56 },
  imageLabel: { flex: 1, marginLeft: 8 },
  limits: { marginTop: 16 },
});
