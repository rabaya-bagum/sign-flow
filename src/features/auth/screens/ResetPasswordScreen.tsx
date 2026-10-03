import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { resetPasswordSchema, type ResetPasswordValues } from '@shared/auth';

import { AppButton, ControlledInput, InlineAlert, Screen } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';

import { signOut, updatePassword } from '../api';
import { useAuthStore } from '../store';
import { AuthHeader } from './AuthHeader';

export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const hasSession = useAuthStore((s) => s.status === 'signedIn');
  const setRecovering = useAuthStore((s) => s.setRecovering);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await updatePassword(password);
      setRecovering(false);
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const cancel = async () => {
    setRecovering(false);
    await signOut().catch(() => undefined);
    router.replace('/');
  };

  return (
    <Screen scroll edges={['bottom']}>
      <AuthHeader title={t('auth.resetTitle')} subtitle={t('auth.resetBody')} />
      {!hasSession ? <InlineAlert message={t('errors.AUTH_LINK_INVALID')} /> : null}
      {error ? <InlineAlert message={error} /> : null}
      <ControlledInput
        control={control}
        name="password"
        label={t('auth.newPassword')}
        hint={t('auth.passwordHint')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <ControlledInput
        control={control}
        name="confirmPassword"
        label={t('auth.confirmPassword')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => void onSubmit()}
      />
      <View style={styles.actions}>
        <AppButton
          title={t('auth.updatePassword')}
          onPress={() => void onSubmit()}
          loading={formState.isSubmitting}
          disabled={!hasSession}
        />
        <AppButton title={t('common.cancel')} variant="ghost" onPress={() => void cancel()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
});
