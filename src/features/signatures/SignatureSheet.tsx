import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppError } from '@shared/errors';

import { AppButton, AppText, BottomSheet, Checkbox, ChipGroup, InlineAlert } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useAllowLandscape } from '@/hooks/useOrientation';
import { useTheme } from '@/theme';

import { downloadSignature } from './api';
import { DrawPane } from './DrawPane';
import { SIGNATURE_FONTS } from './fonts';
import { useSaveSignature, useSavedSignatures } from './hooks';
import { loadProducers } from './loadProducers';
import { writeSignaturePng } from './localFiles';
import { initialsFromName, pngSize, type Point } from './pixels';
import type { InkColor } from './ink';
import { SignatureImage } from './SignatureImage';
import { TypePane } from './TypePane';
import { MAX_SAVED_PER_KIND, type SignatureKind, type SignatureResult } from './types';
import { UploadPane } from './UploadPane';

type Tab = 'draw' | 'type' | 'upload';

export interface SignatureSheetProps {
  visible: boolean;
  kind: SignatureKind;
  /** The signer's name: prefills Type (initials are derived for kind = initials). */
  defaultName: string;
  onComplete: (result: SignatureResult) => void;
  onClose: () => void;
  /** Guest signing (no account): no saved signatures, nothing is saved. */
  guest?: boolean;
}

/**
 * Create or pick a signature / initials (SPEC §5.7). Reused by Account → Signatures now and by
 * signature fields in Phase 6. Returns a local transparent PNG; "Save for future use" also stores it.
 */
export function SignatureSheet(props: SignatureSheetProps) {
  // Remount per opening so every session starts clean.
  return props.visible ? <SignatureSheetBody {...props} /> : null;
}

function SignatureSheetBody({ kind, defaultName, onComplete, onClose, guest = false }: SignatureSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const saved = useSavedSignatures(kind, { enabled: !guest });
  const saveMutation = useSaveSignature();
  const savedRows = guest ? [] : (saved.data ?? []);
  const hasSaved = savedRows.length > 0;

  const [mode, setMode] = useState<'saved' | 'new' | null>(null);
  const effectiveMode = mode ?? (hasSaved ? 'saved' : 'new');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    savedRows.find((r) => r.id === selectedId) ?? savedRows.find((r) => r.is_default) ?? savedRows[0];

  const [tab, setTab] = useState<Tab>('draw');
  const [ink, setInk] = useState<InkColor>('black');
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [padSize, setPadSize] = useState({ width: 0, height: 0 });
  const [text, setText] = useState(kind === 'initials' ? initialsFromName(defaultName) : defaultName.trim());
  const [fontKey, setFontKey] = useState<string>(SIGNATURE_FONTS[0].key);
  const [upload, setUpload] = useState<{ uri: string; threshold: number } | null>(null);
  const [saveForFuture, setSaveForFuture] = useState<boolean | null>(null);
  const atLimit = savedRows.length >= MAX_SAVED_PER_KIND;
  // On by default only for the first signature of this kind.
  const shouldSave = !guest && !atLimit && (saveForFuture ?? (saved.isSuccess && !hasSaved));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useAllowLandscape(effectiveMode === 'new' && tab === 'draw');

  const canConfirm =
    effectiveMode === 'saved'
      ? Boolean(selected)
      : tab === 'draw'
        ? strokes.length > 0 && padSize.width > 0
        : tab === 'type'
          ? text.trim().length > 0
          : upload !== null;

  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      if (effectiveMode === 'saved' && selected) {
        const bytes = await downloadSignature(selected.storage_path);
        const size = pngSize(bytes);
        if (!size) throw new AppError('FILE_UNSUPPORTED');
        onComplete({
          pngUri: await writeSignaturePng(bytes),
          bytes,
          ...size,
          method: selected.method,
          savedSignatureId: selected.id,
        });
        return;
      }
      const { produceSignature } = await loadProducers();
      const method = tab === 'draw' ? 'drawn' : tab === 'type' ? 'typed' : 'uploaded';
      const png =
        method === 'drawn'
          ? await produceSignature({ method, strokes, ...padSize, ink })
          : method === 'typed'
            ? await produceSignature({ method, text, fontKey, ink })
            : await produceSignature({ method, uri: upload!.uri, threshold: upload!.threshold });
      let savedSignatureId: string | undefined;
      if (shouldSave) {
        const row = await saveMutation.mutateAsync({
          kind,
          method,
          png: png.bytes,
          typedText: method === 'typed' ? text.trim() : undefined,
          fontKey: method === 'typed' ? fontKey : undefined,
        });
        savedSignatureId = row.id;
      }
      onComplete({
        pngUri: await writeSignaturePng(png.bytes),
        bytes: png.bytes,
        width: png.width,
        height: png.height,
        method,
        savedSignatureId,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const inkPicker = (
    <ChipGroup
      accessibilityLabel={t('signatures.inkLabel')}
      options={[
        { value: 'black', label: t('signatures.inkBlack') },
        { value: 'blue', label: t('signatures.inkBlue') },
      ]}
      value={ink}
      onChange={setInk}
      testID="sig-ink"
    />
  );

  return (
    <BottomSheet
      visible
      title={t(`signatures.sheetTitle_${kind}`)}
      onClose={onClose}
      closeLabel={t('signatures.close')}
      testID="signature-sheet"
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          {error ? <InlineAlert tone="error" message={error} testID="sig-error" /> : null}
          <AppButton
            title={t(`signatures.confirm_${kind}`)}
            onPress={() => void confirm()}
            disabled={!canConfirm}
            loading={busy}
            fullWidth
            testID="sig-confirm"
          />
        </View>
      }
    >
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
        {hasSaved ? (
          <ChipGroup
            accessibilityLabel={t('signatures.modeLabel')}
            options={[
              { value: 'saved', label: t('signatures.useSaved') },
              { value: 'new', label: t('signatures.createNew') },
            ]}
            value={effectiveMode}
            onChange={setMode}
            testID="sig-mode"
          />
        ) : null}

        {effectiveMode === 'saved' ? (
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('signatures.savedListLabel')}
            style={{ gap: theme.spacing.sm }}
          >
            {savedRows.map((row) => {
              const isSelected = row.id === selected?.id;
              return (
                <Pressable
                  key={row.id}
                  accessibilityRole="radio"
                  aria-checked={isSelected}
                  accessibilityLabel={
                    t('signatures.savedItemLabel', {
                      method: t(`signatures.method_${row.method}`),
                      kind: t(`signatures.kind_${row.kind}`),
                      date: new Date(row.created_at).toLocaleDateString(),
                    }) + (row.is_default ? `, ${t('signatures.savedItemDefault')}` : '')
                  }
                  onPress={() => setSelectedId(row.id)}
                  testID={`sig-saved-${row.id}`}
                  style={[
                    styles.savedItem,
                    {
                      borderRadius: theme.radius.md,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                >
                  <SignatureImage
                    path={row.storage_path}
                    height={kind === 'initials' ? 56 : 64}
                    style={styles.flex}
                  />
                  {row.is_default ? (
                    <AppText variant="caption" color="primary">
                      {t('signatures.savedItemDefault')}
                    </AppText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <>
            <ChipGroup
              accessibilityLabel={t('signatures.tabsLabel')}
              options={[
                { value: 'draw', label: t('signatures.tabDraw') },
                { value: 'type', label: t('signatures.tabType') },
                { value: 'upload', label: t('signatures.tabUpload') },
              ]}
              value={tab}
              onChange={(next) => {
                setTab(next);
                setError(null);
              }}
              testID="sig-tab"
            />
            {tab === 'draw' ? (
              <>
                <DrawPane
                  kind={kind}
                  strokes={strokes}
                  setStrokes={setStrokes}
                  onSize={setPadSize}
                  ink={ink}
                />
                {inkPicker}
              </>
            ) : null}
            {tab === 'type' ? (
              <>
                <TypePane
                  kind={kind}
                  text={text}
                  onChangeText={setText}
                  fontKey={fontKey}
                  onChangeFont={setFontKey}
                  ink={ink}
                />
                {inkPicker}
              </>
            ) : null}
            {tab === 'upload' ? (
              <UploadPane
                uri={upload?.uri ?? null}
                threshold={upload?.threshold ?? 160}
                onPick={(uri, threshold) => setUpload({ uri, threshold })}
                onChangeThreshold={(threshold) => setUpload((u) => (u ? { ...u, threshold } : u))}
                onError={setError}
              />
            ) : null}
            {guest ? null : atLimit ? (
              <AppText variant="footnote" color="textSecondary">
                {t('signatures.limitReached')}
              </AppText>
            ) : (
              <Checkbox
                checked={shouldSave}
                onChange={setSaveForFuture}
                accessibilityLabel={t('signatures.saveForFuture')}
                testID="sig-save"
              >
                <AppText>{t('signatures.saveForFuture')}</AppText>
              </Checkbox>
            )}
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  savedItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 },
  flex: { flex: 1 },
});
