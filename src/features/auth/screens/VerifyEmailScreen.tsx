import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppButton, InlineAlert, Screen } from '@/components';
import { RESEND_COOLDOWN_SECONDS } from '@/constants/limits';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useCountdown } from '@/hooks/useCountdown';
import { useTheme } from '@/theme';

import { resendVerificationEmail } from '../api';
import { AuthHeader } from './AuthHeader';

export function VerifyEmailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const { email, sent } = useLocalSearchParams<{ email?: string; sent?: string }>();
  const { remaining, start } = useCountdown();
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);

  // A verification email was just sent by sign-up; start the cooldown so we don't trip rate limits.
  useEffect(() => {
    if (sent === '1') start(RESEND_COOLDOWN_SECONDS);
  }, [sent, start]);

  const resend = async () => {
    if (!email) return;
    setSending(true);
    setNotice(null);
    try {
      await resendVerificationEmail(email);
      setNotice({ tone: 'success', message: t('auth.resent') });
      start(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setNotice({ tone: 'error', message: errorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <View
        style={[
          styles.icon,
          { backgroundColor: theme.colors.primarySubtle, borderRadius: theme.radius.full },
        ]}
      >
        <Ionicons name="mail-unread-outline" size={36} color={theme.colors.primary} />
      </View>
      <AuthHeader
        title={t('auth.verifyTitle')}
        subtitle={email ? t('auth.verifyBody', { email }) : t('auth.verifyBodyNoEmail')}
      />
      {notice ? <InlineAlert message={notice.message} tone={notice.tone} /> : null}
      <View style={styles.actions}>
        {email ? (
          <AppButton
            title={remaining > 0 ? t('auth.resendIn', { seconds: remaining }) : t('auth.resend')}
            variant="secondary"
            onPress={() => void resend()}
            disabled={remaining > 0}
            loading={sending}
            testID="verify-resend"
          />
        ) : null}
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
  icon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  actions: { gap: 8 },
});
