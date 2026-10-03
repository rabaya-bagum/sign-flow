import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { forgotPasswordSchema, type ForgotPasswordValues } from '@shared/auth';

import { AppButton, ControlledInput, InlineAlert, Screen } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';

import { sendPasswordResetEmail } from '../api';
import { AuthHeader } from './AuthHeader';

export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await sendPasswordResetEmail(email);
      setSentTo(email); // Same message whether or not the account exists (no enumeration).
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Screen scroll edges={['bottom']}>
      <AuthHeader title={t('auth.forgotTitle')} subtitle={t('auth.forgotBody')} />
      {error ? <InlineAlert message={error} /> : null}
      {sentTo ? (
        <InlineAlert tone="success" message={t('auth.resetSent', { email: sentTo })} testID="reset-sent" />
      ) : null}
      <ControlledInput
        control={control}
        name="email"
        label={t('auth.email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => void onSubmit()}
      />
      <View style={styles.actions}>
        <AppButton
          title={t('auth.sendResetLink')}
          onPress={() => void onSubmit()}
          loading={formState.isSubmitting}
        />
        <AppButton
          title={t('auth.backToSignIn')}
          variant="ghost"
          onPress={() => router.replace('/sign-in')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
});
