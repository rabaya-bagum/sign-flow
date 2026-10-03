import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { signUpSchema, type SignUpInput, type SignUpValues } from '@shared/auth';

import { AppButton, AppText, Checkbox, ControlledInput, InlineAlert, Screen, TextLink } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useValidationMessage } from '@/hooks/useValidationMessage';
import { LEGAL_URLS } from '@/constants/legal';
import { openLink } from '@/lib/openLink';

import { signUpWithEmail } from '../api';
import { AuthHeader } from './AuthHeader';

export function SignUpScreen() {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpInput, unknown, SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '', acceptTerms: false },
  });
  const termsError = useValidationMessage(formState.errors.acceptTerms?.message);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await signUpWithEmail(values);
      router.replace({ pathname: '/verify-email', params: { email: values.email, sent: '1' } });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Screen scroll edges={['bottom']}>
      <AuthHeader title={t('auth.signUpTitle')} />
      {error ? <InlineAlert message={error} testID="sign-up-error" /> : null}
      <ControlledInput
        control={control}
        name="fullName"
        label={t('auth.fullName')}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        testID="sign-up-name"
      />
      <ControlledInput
        control={control}
        name="email"
        label={t('auth.email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        testID="sign-up-email"
      />
      <ControlledInput
        control={control}
        name="password"
        label={t('auth.password')}
        hint={t('auth.passwordHint')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        testID="sign-up-password"
      />
      <Controller
        control={control}
        name="acceptTerms"
        render={({ field }) => (
          <Checkbox
            checked={field.value === true}
            onChange={(checked) => field.onChange(checked)}
            accessibilityLabel={`${t('auth.acceptTermsPrefix')} ${t('auth.terms')} ${t('auth.and')} ${t('auth.privacyPolicy')}`}
            error={termsError}
            testID="sign-up-terms"
          >
            <View style={styles.terms}>
              <AppText variant="subhead">{t('auth.acceptTermsPrefix')}</AppText>
              <TextLink title={t('auth.terms')} role="link" onPress={() => void openLink(LEGAL_URLS.terms)} />
              <AppText variant="subhead">{t('auth.and')}</AppText>
              <TextLink
                title={t('auth.privacyPolicy')}
                role="link"
                onPress={() => void openLink(LEGAL_URLS.privacy)}
              />
            </View>
          </Checkbox>
        )}
      />
      <AppButton
        title={t('auth.signUp')}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
        testID="sign-up-submit"
      />
      <View style={styles.footer}>
        <AppText variant="subhead" color="textSecondary">
          {t('auth.haveAccount')}
        </AppText>
        <TextLink title={t('auth.signIn')} onPress={() => router.replace('/sign-in')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  terms: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 },
});
