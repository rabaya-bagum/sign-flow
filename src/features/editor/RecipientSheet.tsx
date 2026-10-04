import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { emailSchema } from '@shared/auth';

import { AppButton, AppInput, BottomSheet } from '@/components';
import { useTheme } from '@/theme';

import type { RecipientInput } from './api';

interface RecipientSheetProps {
  visible: boolean;
  initial: { name: string; email: string | null } | null;
  defaultName: string;
  canRemove: boolean;
  onSave: (input: RecipientInput) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Add or edit a (possibly placeholder) recipient from the editor. Full recipient step: Phase 5. */
export function RecipientSheet(props: RecipientSheetProps) {
  return props.visible ? <Body {...props} /> : null;
}

function Body({ initial, defaultName, canRemove, onSave, onRemove, onClose }: RecipientSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [name, setName] = useState(initial?.name ?? defaultName);
  const [email, setEmail] = useState(initial?.email ?? '');
  const [touched, setTouched] = useState(false);
  const trimmedEmail = email.trim();
  const emailError =
    touched && trimmedEmail && !emailSchema.safeParse(trimmedEmail).success
      ? t('validation.emailInvalid')
      : undefined;
  const valid = name.trim().length > 0 && (!trimmedEmail || emailSchema.safeParse(trimmedEmail).success);

  return (
    <BottomSheet
      visible
      title={initial ? t('editor.recipient.editTitle') : t('editor.recipient.addTitle')}
      onClose={onClose}
      closeLabel={t('signatures.close')}
      testID="recipient-sheet"
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          <AppButton
            title={t('editor.recipient.save')}
            disabled={!valid}
            fullWidth
            onPress={() =>
              onSave({ name: name.trim(), email: trimmedEmail ? trimmedEmail.toLowerCase() : null })
            }
            testID="recipient-save"
          />
          {initial && canRemove ? (
            <AppButton
              title={t('editor.recipient.remove')}
              variant="destructive"
              fullWidth
              onPress={onRemove}
              testID="recipient-remove"
            />
          ) : null}
        </View>
      }
    >
      <AppInput
        label={t('editor.recipient.name')}
        value={name}
        onChangeText={setName}
        maxLength={120}
        autoCapitalize="words"
        testID="recipient-name"
      />
      <AppInput
        label={t('editor.recipient.email')}
        value={email}
        onChangeText={setEmail}
        onBlur={() => setTouched(true)}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        hint={t('editor.recipient.emailHint')}
        error={emailError}
        testID="recipient-email"
      />
    </BottomSheet>
  );
}
