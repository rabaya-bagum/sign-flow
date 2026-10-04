import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { isAppError } from '@shared/errors';
import { resetPasswordSchema, type ResetPasswordValues } from '@shared/auth';

import { AppButton, AppInput, ControlledInput, InlineAlert, Screen } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';

import { changePassword, requestReauthCode } from './api';

/**
 * Account → Security → Change password. If the last sign-in is not recent, Supabase wants proof:
 * we email a code and the user enters it here (SPEC §5.10).
 */
export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const { control, handleSubmit, formState } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await changePassword(password, needsCode ? code.trim() : undefined);
      router.back();
    } catch (e) {
      if (isAppError(e) && e.code === 'REAUTH_REQUIRED' && !needsCode) {
        try {
          await requestReauthCode();
          setNeedsCode(true);
        } catch (sendError) {
          setError(errorMessage(sendError));
        }
        return;
      }
      setError(errorMessage(e));
    }
  });

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={{ paddingTop: theme.spacing.lg }}
      testID="change-password-screen"
    >
      {error ? <InlineAlert message={error} /> : null}
      {needsCode ? <InlineAlert tone="info" message={t('security.reauthCodeSent')} /> : null}
      <ControlledInput
        control={control}
        name="password"
        label={t('auth.newPassword')}
        hint={t('auth.passwordHint')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        testID="change-password-new"
      />
      <ControlledInput
        control={control}
        name="confirmPassword"
        label={t('auth.confirmPassword')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        testID="change-password-confirm"
      />
      {needsCode ? (
        <AppInput
          label={t('security.reauthCode')}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 10))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          testID="change-password-code"
        />
      ) : null}
      <View style={styles.actions}>
        <AppButton
          title={t('auth.updatePassword')}
          onPress={() => void onSubmit()}
          loading={formState.isSubmitting}
          disabled={needsCode && code.trim().length < 6}
          testID="change-password-submit"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8, marginTop: 8 },
});
