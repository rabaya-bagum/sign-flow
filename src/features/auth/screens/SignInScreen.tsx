import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { signInSchema, type SignInValues } from '@shared/auth';
import { isAppError } from '@shared/errors';

import { AppButton, AppText, ControlledInput, InlineAlert, Screen, TextLink } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';

import { signInWithEmail } from '../api';
import { AuthHeader } from './AuthHeader';

export function SignInScreen() {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await signInWithEmail(values);
    } catch (e) {
      if (isAppError(e) && e.code === 'EMAIL_NOT_CONFIRMED') {
        router.push({ pathname: '/verify-email', params: { email: values.email } });
        return;
      }
      setError(errorMessage(e));
    }
  });

  return (
    <Screen scroll edges={['bottom']}>
      <AuthHeader title={t('auth.signInTitle')} />
      {error ? <InlineAlert message={error} testID="sign-in-error" /> : null}
      <ControlledInput
        control={control}
        name="email"
        label={t('auth.email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        testID="sign-in-email"
      />
      <ControlledInput
        control={control}
        name="password"
        label={t('auth.password')}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void onSubmit()}
        testID="sign-in-password"
      />
      <View style={styles.forgot}>
        <TextLink title={t('auth.forgotPassword')} onPress={() => router.push('/forgot-password')} />
      </View>
      <AppButton
        title={t('auth.signIn')}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
        testID="sign-in-submit"
      />
      <View style={styles.footer}>
        <AppText variant="subhead" color="textSecondary">
          {t('auth.noAccount')}
        </AppText>
        <TextLink title={t('auth.signUp')} onPress={() => router.replace('/sign-up')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  forgot: { alignItems: 'flex-end', marginTop: -8, marginBottom: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 },
});
