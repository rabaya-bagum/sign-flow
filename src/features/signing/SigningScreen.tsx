import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FIELD_TYPES, type Field } from '@shared/fields';
import {
  formatDateSigned,
  initialEntries,
  isFilled,
  nextIncompleteField,
  orderFields,
  type SigningSession,
  type SubmitSigningResult,
} from '@shared/signing';

import {
  ActionSheet,
  AppButton,
  AppText,
  BottomSheet,
  ErrorState,
  IconButton,
  InlineAlert,
  type SheetAction,
} from '@/components';
import { shareSignedFile, toAppUrl } from '@/features/documents/download';
import { SignatureSheet } from '@/features/signatures/SignatureSheet';
import { PdfSurface, type PdfSurfaceError, type PdfSurfaceHandle } from '@/features/viewer';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { deviceTimeZone, type SigningClient } from './api';
import {
  adopt,
  applyImage,
  buildOverlays,
  canFinish,
  fieldAt,
  fieldText,
  progress,
  setValue,
  type SigningValues,
  toggleChoice,
  toSubmission,
} from './logic';
import { ConsentSheet, DeclineSheet, FieldSheet, FinishSheet } from './sheets';

export interface SigningScreenProps {
  client: SigningClient;
  /** A session in a content state: 'sign', 'approve' or 'view'. */
  session: SigningSession;
  onSubmitted: (result: SubmitSigningResult) => void;
  onDeclined: () => void;
  onViewDetails?: () => void;
  /** 'view' state: leave the screen. */
  onDone?: () => void;
}

type Sheet = 'none' | 'consent' | 'fields' | 'finish' | 'decline' | 'more';

/**
 * The signing experience shared by in-app and guest signing (SPEC §5.5, §5.12): the PDF with the
 * signer's fields highlighted and earlier values shown, a progress pill, Next field, ESIGN consent
 * before the first interaction, Finish with an explicit confirmation, and Decline.
 */
export function SigningScreen({
  client,
  session,
  onSubmitted,
  onDeclined,
  onViewDetails,
  onDone,
}: SigningScreenProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const errorMessage = useAppErrorMessage();
  const surface = useRef<PdfSurfaceHandle>(null);
  const mode = session.state as 'sign' | 'approve' | 'view';
  const fields = session.fields;
  const ordered = useMemo(() => orderFields(fields), [fields]);

  const [values, setValues] = useState<SigningValues>(() => ({
    entries: initialEntries(fields, { name: session.recipient.name, email: session.recipient.email }),
    adopted: {},
  }));
  const [consented, setConsented] = useState(!session.consent_required || mode === 'view');
  const [sheet, setSheet] = useState<Sheet>(consented ? 'none' : 'consent');
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<Field | null>(null);
  const [signing, setSigning] = useState<Field | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [renderError, setRenderError] = useState<PdfSurfaceError | null>(null);
  const [timeZone] = useState(deviceTimeZone);
  const [now] = useState(() => new Date());

  const label = (field: Field) => t(`signing.field_${field.type}`);
  const overlays = useMemo(() => {
    const labels = Object.fromEntries(FIELD_TYPES.map((k) => [k, t(`signing.field_${k}`)])) as Record<
      Field['type'],
      string
    >;
    return buildOverlays(
      fields,
      session.filled,
      values,
      {
        required: theme.colors.primary,
        optional: theme.colors.textTertiary,
        fill: `${theme.colors.fieldHighlight}E6`,
        filledFill: '#FFFFFF00',
      },
      (field) =>
        fieldText(
          field,
          values,
          { ...labels, signature: t('signing.tapToSign') },
          field.type === 'date_signed'
            ? formatDateSigned(
                now,
                (field.properties as { format?: 'MMM d, yyyy' }).format,
                timeZone ?? 'UTC',
              )
            : '',
        ),
      (field) => labels[field.type],
    );
  }, [fields, session.filled, values, theme, t, now, timeZone]);
  const count = progress(fields, values);
  const finishable = canFinish(fields, values);

  const requireConsent = (): boolean => {
    if (consented) return true;
    setSheet('consent');
    return false;
  };

  const focus = (field: Field) => {
    setActive(field.id);
    surface.current?.goToPage(field.page_number);
  };

  /** Opens the right editor; `direct` (a tap on the page) toggles checkboxes and radios in place. */
  const openField = (field: Field, direct = false) => {
    if (!requireConsent()) return;
    focus(field);
    if (field.type === 'signature' || field.type === 'initials') {
      const adopted = values.adopted[field.type];
      if (adopted && !values.entries[field.id]?.hasImage) setValues((v) => applyImage(v, field, adopted));
      else setSigning(field);
      return;
    }
    if (direct && (field.type === 'checkbox' || field.type === 'radio')) {
      setValues((v) => toggleChoice(v, field, fields));
      return;
    }
    setEditing(field);
  };

  const goNext = () => {
    const next = nextIncompleteField(fields, values.entries, active);
    if (next) openField(next);
  };

  /** Runs a server call with the shared busy flag and error message. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const agree = () =>
    run(async () => {
      await client.consent();
      setConsented(true);
      setSheet('none');
    });

  const submit = () =>
    run(async () => onSubmitted(await client.submit(toSubmission(fields, values, timeZone))));

  const declineWith = (reason: string) =>
    run(async () => {
      await client.decline(reason);
      onDeclined();
    });

  const moreActions: SheetAction[] = [
    ...(mode !== 'view' && session.document.allow_decline
      ? [
          {
            key: 'decline',
            label: t('signing.decline'),
            icon: 'close-circle-outline' as const,
            destructive: true,
            onPress: () => {
              setError(null);
              setSheet('decline');
            },
          },
        ]
      : []),
    {
      key: 'download',
      label: t('signing.downloadOriginal'),
      icon: 'download-outline',
      onPress: () => {
        setSheet('none');
        client
          .download('original')
          .then(shareSignedFile)
          .catch((e: unknown) => setError(errorMessage(e)));
      },
    },
    ...(onViewDetails
      ? [
          {
            key: 'details',
            label: t('signing.viewDetails'),
            icon: 'information-circle-outline' as const,
            onPress: onViewDetails,
          },
        ]
      : []),
  ];

  const editingEntry = editing ? values.entries[editing.id] : undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]} testID="signing-screen">
      <View
        style={[
          styles.topBar,
          { backgroundColor: theme.colors.surfaceElevated, borderBottomColor: theme.colors.border },
        ]}
      >
        <View style={styles.topText}>
          <AppText variant="subhead" weight="600" numberOfLines={1}>
            {session.document.title}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {t('signing.sentBy', { name: session.document.sender.name })}
          </AppText>
        </View>
        {mode === 'sign' ? (
          <View
            accessibilityRole="text"
            accessibilityLabel={t('signing.progressLabel', count)}
            style={[
              styles.pill,
              { backgroundColor: theme.colors.fieldHighlight, borderRadius: theme.radius.full },
            ]}
            testID="signing-progress"
          >
            <AppText variant="caption" weight="600">
              {count.total ? t('signing.progress', count) : t('signing.noRequired')}
            </AppText>
          </View>
        ) : null}
        <IconButton
          icon="ellipsis-horizontal"
          accessibilityLabel={t('signing.more')}
          onPress={() => setSheet('more')}
          testID="signing-more"
        />
      </View>

      {mode === 'view' ? <InlineAlert tone="info" message={t('signing.viewOnly')} /> : null}
      {!consented && sheet !== 'consent' ? (
        <Pressable onPress={() => setSheet('consent')} accessibilityRole="button" style={styles.banner}>
          <InlineAlert tone="info" message={t('signing.consentTitle')} />
        </Pressable>
      ) : null}

      <View style={styles.flex}>
        {renderError ? (
          <ErrorState message={`${t('viewer.error')} ${t(`errors.${renderError.code}`)}`} />
        ) : (
          <>
            <PdfSurface
              ref={surface}
              url={session.pdf_url ? toAppUrl(session.pdf_url) : null}
              overlays={overlays}
              highlightId={active}
              onLoaded={() => setLoaded(true)}
              onTap={(tap) => {
                const field = fieldAt(fields, tap);
                if (field) openField(field, true);
              }}
              onError={setRenderError}
              testID="signing-surface"
            />
            {!loaded ? (
              <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
                <ActivityIndicator
                  color={theme.colors.textSecondary}
                  accessibilityLabel={t('signing.loading')}
                />
              </View>
            ) : null}
          </>
        )}
      </View>

      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderTopColor: theme.colors.border,
            paddingBottom: Math.max(insets.bottom, theme.spacing.sm),
          },
        ]}
      >
        {error && sheet === 'none' ? <InlineAlert message={error} testID="signing-error" /> : null}
        {mode === 'sign' ? (
          <View style={styles.row}>
            <AppButton
              title={t('signing.fields')}
              icon="list-outline"
              variant="secondary"
              fullWidth={false}
              accessibilityHint={t('signing.fieldsHint')}
              onPress={() => requireConsent() && setSheet('fields')}
              testID="signing-fields"
            />
            {count.done < count.total ? (
              <AppButton
                title={t('signing.nextField')}
                icon="arrow-down-outline"
                fullWidth={false}
                accessibilityHint={t('signing.nextFieldHint')}
                onPress={goNext}
                style={styles.flex}
                testID="signing-next"
              />
            ) : (
              <AppButton
                title={t('signing.finish')}
                icon="checkmark-done-outline"
                fullWidth={false}
                disabled={!finishable}
                onPress={() => requireConsent() && setSheet('finish')}
                style={styles.flex}
                testID="signing-finish"
              />
            )}
          </View>
        ) : mode === 'approve' ? (
          <AppButton
            title={t('signing.approve')}
            icon="checkmark-done-outline"
            onPress={() => requireConsent() && setSheet('finish')}
            testID="signing-finish"
          />
        ) : (
          <AppButton title={t('signing.done')} onPress={onDone} testID="signing-done" />
        )}
      </View>

      <ConsentSheet
        visible={sheet === 'consent'}
        busy={busy}
        error={sheet === 'consent' ? error : null}
        onAgree={() => void agree()}
        onClose={() => setSheet('none')}
      />
      <BottomSheet
        visible={sheet === 'fields'}
        title={t('signing.fields')}
        onClose={() => setSheet('none')}
        closeLabel={t('signatures.close')}
        testID="fields-sheet"
      >
        <View style={{ gap: theme.spacing.xs, paddingBottom: theme.spacing.md }}>
          {ordered.map((field, i) => {
            const done = isFilled(field, values.entries[field.id]);
            const name = `${i + 1}. ${label(field)}`;
            return (
              <Pressable
                key={field.id}
                accessibilityRole="button"
                accessibilityLabel={
                  done
                    ? t('signing.fieldFilled', { field: name })
                    : field.required
                      ? t('signing.fieldEmpty', { field: name })
                      : t('signing.fieldOptional', { field: name })
                }
                onPress={() => {
                  setSheet('none');
                  openField(field);
                }}
                style={[styles.fieldRow, { borderBottomColor: theme.colors.border }]}
                testID={`fields-item-${i}`}
              >
                <AppText style={styles.flex}>{name}</AppText>
                <AppText
                  variant="caption"
                  color={done ? 'success' : field.required ? 'primary' : 'textTertiary'}
                >
                  {done ? '✓' : field.required ? '•' : ''}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
      <FieldSheet
        field={editing}
        value={editingEntry?.value}
        label={editing ? label(editing) : ''}
        onChange={(value) => {
          if (!editing) return;
          const field = editing;
          setValues((v) =>
            field.type === 'radio' && value === 'true'
              ? toggleChoice(v, field, fields)
              : setValue(v, field, value),
          );
        }}
        onClose={() => setEditing(null)}
      />
      <SignatureSheet
        visible={signing !== null}
        kind={signing?.type === 'initials' ? 'initials' : 'signature'}
        defaultName={session.recipient.name}
        guest={client.mode === 'guest'}
        onComplete={(result) => {
          const field = signing;
          setSigning(null);
          if (!field) return;
          setValues((v) => applyImage(v, field, adopt(result.bytes)));
        }}
        onClose={() => setSigning(null)}
      />
      <FinishSheet
        visible={sheet === 'finish'}
        approve={mode === 'approve'}
        title={session.document.title}
        busy={busy}
        error={sheet === 'finish' ? error : null}
        onConfirm={() => void submit()}
        onClose={() => setSheet('none')}
      />
      <DeclineSheet
        visible={sheet === 'decline'}
        sender={session.document.sender.name}
        busy={busy}
        error={sheet === 'decline' ? error : null}
        onConfirm={(reason) => void declineWith(reason)}
        onClose={() => setSheet('none')}
      />
      <ActionSheet
        visible={sheet === 'more'}
        title={t('signing.more')}
        actions={moreActions}
        onClose={() => setSheet('none')}
        closeLabel={t('signatures.close')}
        testID="signing-more-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topText: { flex: 1, minWidth: 0 },
  pill: { paddingHorizontal: 10, paddingVertical: 4 },
  banner: { paddingHorizontal: 12, paddingTop: 8 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: 10 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
