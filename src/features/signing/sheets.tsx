import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Field } from '@shared/fields';
import { ESIGN_DISCLOSURE, ESIGN_DISCLOSURE_VERSION } from '@shared/legal';
import { DECLINE_REASON_MAX, normalizeValue } from '@shared/signing';

import { AppButton, AppInput, AppText, BottomSheet, Checkbox, InlineAlert } from '@/components';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

/** ESIGN/UETA consumer disclosure (SPEC §17.1), shown before the signer's first interaction. */
export function ConsentSheet({
  visible,
  busy,
  error,
  onAgree,
  onClose,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onAgree: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <BottomSheet
      visible={visible}
      title={t('signing.consentTitle')}
      onClose={onClose}
      closeLabel={t('signing.consentNotNow')}
      testID="consent-sheet"
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          {error ? <InlineAlert message={error} /> : null}
          <AppButton
            title={t('signing.consentAgree')}
            accessibilityHint={t('signing.consentAgreeHint')}
            onPress={onAgree}
            loading={busy}
            testID="consent-agree"
          />
          <AppButton
            title={t('signing.consentNotNow')}
            variant="secondary"
            onPress={onClose}
            testID="consent-later"
          />
        </View>
      }
    >
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
        <AppText variant="headline">{ESIGN_DISCLOSURE.title}</AppText>
        <AppText>{ESIGN_DISCLOSURE.intro}</AppText>
        {ESIGN_DISCLOSURE.sections.map((section) => (
          <View key={section.heading} style={{ gap: theme.spacing.xs }}>
            <AppText weight="600">{section.heading}</AppText>
            <AppText color="textSecondary">{section.body}</AppText>
          </View>
        ))}
        <AppText variant="caption" color="textTertiary">
          {t('signing.consentVersion', { version: ESIGN_DISCLOSURE_VERSION })}
        </AppText>
      </View>
    </BottomSheet>
  );
}

/**
 * Fills one non-signature field: text-like fields get an input, dropdowns a list, checkboxes and
 * radios an explicit choice (the accessible path; tapping them on the page toggles directly).
 */
export function FieldSheet({
  field,
  value,
  label,
  onChange,
  onClose,
}: {
  field: Field | null;
  value: string | null | undefined;
  label: string;
  onChange: (value: string | null) => void;
  onClose: () => void;
}) {
  return field ? (
    <FieldSheetBody
      key={field.id}
      field={field}
      value={value}
      label={label}
      onChange={onChange}
      onClose={onClose}
    />
  ) : null;
}

function FieldSheetBody({
  field,
  value,
  label,
  onChange,
  onClose,
}: {
  field: Field;
  value: string | null | undefined;
  label: string;
  onChange: (value: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [draft, setDraft] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  const properties = field.properties as { options?: string[]; placeholder?: string; maxLength?: number };

  const confirm = () => {
    const result = normalizeValue(field, draft);
    if ('issue' in result) {
      setInvalid(true);
      return;
    }
    onChange(result.value);
    onClose();
  };

  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  switch (field.type) {
    case 'date_signed':
      body = <AppText>{t('signing.dateAuto')}</AppText>;
      break;
    case 'checkbox':
    case 'radio':
      body = (
        <Checkbox
          checked={value === 'true'}
          onChange={(checked) => {
            onChange(checked ? 'true' : 'false');
            onClose();
          }}
          accessibilityLabel={field.type === 'radio' ? t('signing.chooseThis') : t('signing.checkThis')}
          testID="field-sheet-check"
        >
          <AppText>
            {field.type === 'radio'
              ? `${t('signing.chooseThis')}: ${(field.properties as { optionValue?: string }).optionValue ?? ''}`
              : t('signing.checkThis')}
          </AppText>
        </Checkbox>
      );
      break;
    case 'dropdown':
      body = (
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: theme.spacing.xs }}>
          {(properties.options ?? []).map((option) => {
            const selected = option === value;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                aria-checked={selected}
                aria-selected={selected}
                onPress={() => {
                  onChange(option);
                  onClose();
                }}
                style={[
                  styles.option,
                  {
                    borderRadius: theme.radius.md,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    borderWidth: selected ? 2 : 1,
                  },
                ]}
                testID={`field-option-${option}`}
              >
                <AppText>{option}</AppText>
              </Pressable>
            );
          })}
        </View>
      );
      break;
    default:
      body = (
        <AppInput
          label={label}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            setInvalid(false);
          }}
          placeholder={properties.placeholder}
          maxLength={properties.maxLength ?? 500}
          autoCapitalize={
            field.type === 'email' ? 'none' : field.type === 'full_name' ? 'words' : 'sentences'
          }
          keyboardType={field.type === 'email' ? 'email-address' : 'default'}
          autoComplete={field.type === 'email' ? 'email' : field.type === 'full_name' ? 'name' : 'off'}
          error={invalid ? t('signing.invalidValue') : undefined}
          onSubmitEditing={confirm}
          returnKeyType="done"
          autoFocus
          testID="field-sheet-input"
        />
      );
      footer = (
        <View style={{ gap: theme.spacing.sm }}>
          <AppButton title={t('signing.confirmValue')} onPress={confirm} testID="field-sheet-confirm" />
          {!field.required && value ? (
            <AppButton
              title={t('signing.clear')}
              variant="secondary"
              onPress={() => {
                onChange(null);
                onClose();
              }}
            />
          ) : null}
        </View>
      );
  }

  return (
    <BottomSheet
      visible
      title={label}
      onClose={onClose}
      closeLabel={t('signatures.close')}
      footer={footer}
      testID="field-sheet"
    >
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>{body}</View>
    </BottomSheet>
  );
}

/** Intent to sign (SPEC §17.1): an explicit confirmation before submitting. */
export function FinishSheet({
  visible,
  approve,
  title,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  approve: boolean;
  title: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <BottomSheet
      visible={visible}
      title={approve ? t('signing.finishTitleApprove') : t('signing.finishTitle')}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      testID="finish-sheet"
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          {error ? <InlineAlert message={error} testID="finish-error" /> : null}
          <AppButton
            title={approve ? t('signing.finishConfirmApprove') : t('signing.finishConfirm')}
            onPress={onConfirm}
            loading={busy}
            testID="finish-confirm"
          />
        </View>
      }
    >
      <AppText style={{ paddingBottom: theme.spacing.md }}>
        {approve ? t('signing.finishBodyApprove', { title }) : t('signing.finishBody', { title })}
      </AppText>
    </BottomSheet>
  );
}

/** Decline with a required reason (SPEC §5.5). */
export function DeclineSheet({
  visible,
  sender,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  sender: string;
  busy: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [reason, setReason] = useState('');
  return (
    <BottomSheet
      visible={visible}
      title={t('signing.declineTitle')}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      testID="decline-sheet"
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          {error ? <InlineAlert message={error} /> : null}
          <AppButton
            title={t('signing.declineConfirm')}
            variant="destructive"
            disabled={reason.trim().length === 0}
            loading={busy}
            onPress={() => onConfirm(reason.trim())}
            testID="decline-confirm"
          />
        </View>
      }
    >
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
        <AppText>{t('signing.declineBody', { sender })}</AppText>
        <AppInput
          label={t('signing.declineReason')}
          hint={t('signing.declineReasonHint')}
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={DECLINE_REASON_MAX}
          testID="decline-reason"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  option: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 14, justifyContent: 'center' },
});
