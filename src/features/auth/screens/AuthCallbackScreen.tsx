import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppButton, AppText, InlineAlert, Screen } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';
import { AppError } from '@shared/errors';

import { exchangeAuthCode } from '../api';
import { useAuthStore } from '../store';

type Params = {
  code?: string;
  flow?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
};

/**
 * Landing route for Supabase email links (signflow://auth/callback?code=…&flow=signup|recovery).
 * Exchanges the PKCE code for a session, then hands off to the index redirect.
 */
export function AuthCallbackScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const params = useLocalSearchParams<Params>();
  const [failure, setFailure] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const isRecovery = params.flow === 'recovery';

    const run = async () => {
      if (params.error || params.error_code || !params.code) throw new AppError('AUTH_LINK_INVALID');
      // Set before the exchange so the router keeps the user on reset-password once signed in.
      if (isRecovery) useAuthStore.getState().setRecovering(true);
      await exchangeAuthCode(params.code);
      router.replace(isRecovery ? '/reset-password' : '/');
    };

    run().catch((e: unknown) => {
      if (isRecovery) useAuthStore.getState().setRecovering(false);
      // A sign-up link opened on another device verifies the email but cannot complete PKCE here.
      setFailure(params.flow === 'signup' && params.code ? t('auth.linkVerifiedSignIn') : errorMessage(e));
    });
  }, [params, t, errorMessage]);

  return (
    <Screen contentStyle={styles.center}>
      {failure ? (
        <View style={styles.failure}>
          <InlineAlert message={failure} tone={params.flow === 'signup' && params.code ? 'info' : 'error'} />
          <AppButton title={t('auth.backToSignIn')} onPress={() => router.replace('/')} />
        </View>
      ) : (
        <View style={styles.working} accessibilityLiveRegion="polite">
          <ActivityIndicator
            color={theme.colors.primary}
            size="large"
            accessibilityLabel={t('common.loading')}
          />
          <AppText variant="callout" color="textSecondary">
            {t('auth.callbackWorking')}
          </AppText>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center' },
  working: { alignItems: 'center', gap: 16 },
  failure: { gap: 8 },
});
