import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, InlineAlert, Screen, TextLink } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { env } from '@/lib/env';
import { isAppError } from '@shared/errors';
import { useTheme } from '@/theme';

import { isAppleSignInAvailable, signInWithApple, signInWithGoogle } from '../socialAuth';

type Provider = 'apple' | 'google';

export function WelcomeScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void isAppleSignInAvailable()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const run = async (provider: Provider) => {
    setError(null);
    setPending(provider);
    try {
      await (provider === 'apple' ? signInWithApple() : signInWithGoogle());
      // Auth state change moves the user into the app.
    } catch (e) {
      if (!(isAppError(e) && e.code === 'SIGN_IN_CANCELLED')) setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: theme.colors.primary, borderRadius: theme.radius.xl }]}>
          <Ionicons name="create-outline" size={40} color={theme.colors.onPrimary} />
        </View>
        <AppText variant="title2" color="primary" weight="700">
          {t('common.appName')}
        </AppText>
        <AppText variant="largeTitle" align="center" accessibilityRole="header">
          {t('auth.welcomeTitle')}
        </AppText>
        <AppText variant="callout" color="textSecondary" align="center">
          {t('auth.welcomeSubtitle')}
        </AppText>
      </View>

      <View style={styles.actions}>
        {error ? <InlineAlert message={error} /> : null}

        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              theme.scheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={theme.radius.md}
            style={styles.apple}
            onPress={() => void run('apple')}
          />
        ) : null}

        {env.isGoogleConfigured ? (
          <AppButton
            title={t('auth.continueWithGoogle')}
            variant="secondary"
            icon="logo-google"
            loading={pending === 'google'}
            disabled={pending !== null}
            onPress={() => void run('google')}
          />
        ) : null}

        <AppButton
          title={t('auth.signUpWithEmail')}
          icon="mail-outline"
          disabled={pending !== null}
          onPress={() => router.push('/sign-up')}
          testID="welcome-sign-up"
        />

        <View style={styles.signInRow}>
          <AppText variant="subhead" color="textSecondary">
            {t('auth.haveAccount')}
          </AppText>
          <TextLink
            title={t('auth.signIn')}
            onPress={() => router.push('/sign-in')}
            testID="welcome-sign-in"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'space-between', paddingTop: 48 },
  hero: { alignItems: 'center', gap: 12 },
  mark: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actions: { gap: 12, marginTop: 40 },
  apple: { height: 50, alignSelf: 'stretch' },
  signInRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
});
