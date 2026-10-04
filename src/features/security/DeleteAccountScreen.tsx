import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { isAppError } from '@shared/errors';

import { AppButton, AppInput, AppText, Card, ConfirmationModal, InlineAlert, Screen } from '@/components';
import { signInWithApple, signInWithGoogle } from '@/features/auth/socialAuth';
import { useAuthStore } from '@/features/auth/store';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';

import { deleteAccount, hasPassword, socialProviders } from './api';

/**
 * Account → Delete account (SPEC §17.3, App Store 5.1.1(v)). Explains what goes and what stays,
 * re-authenticates (password, or a fresh Apple/Google sign-in) and deletes on the server.
 */
export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const session = useAuthStore((s) => s.session);
  const withPassword = hasPassword(session);
  const providers = socialProviders(session);
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      // Success signs this device out; the root guards then show the welcome screen.
      await deleteAccount(withPassword ? password : undefined);
    } catch (e) {
      setConfirming(false);
      if (isAppError(e) && e.code === 'REAUTH_REQUIRED' && !withPassword) setNeedsSignIn(true);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const signInAgain = async (provider: 'apple' | 'google') => {
    setError(null);
    try {
      await (provider === 'apple' ? signInWithApple() : signInWithGoogle());
      setNeedsSignIn(false);
      setConfirming(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const items = (key: 'deleteGoes' | 'deleteStays') =>
    (t(`security.${key}`, { returnObjects: true }) as string[]).map((line) => (
      <AppText key={line} variant="callout" style={styles.item}>
        {`•  ${line}`}
      </AppText>
    ));

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={{ paddingTop: theme.spacing.lg, gap: theme.spacing.lg }}
      testID="delete-account-screen"
    >
      {error ? <InlineAlert message={error} testID="delete-account-error" /> : null}
      <Card>
        <AppText variant="headline" accessibilityRole="header">
          {t('security.deleteGoesTitle')}
        </AppText>
        {items('deleteGoes')}
      </Card>
      <Card>
        <AppText variant="headline" accessibilityRole="header">
          {t('security.deleteStaysTitle')}
        </AppText>
        {items('deleteStays')}
      </Card>

      {withPassword ? (
        <AppInput
          label={t('security.deletePassword')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          testID="delete-account-password"
        />
      ) : needsSignIn ? (
        <View style={styles.actions}>
          {providers.map((p) => (
            <AppButton
              key={p}
              title={t(p === 'apple' ? 'security.reauthApple' : 'security.reauthGoogle')}
              variant="secondary"
              onPress={() => void signInAgain(p)}
            />
          ))}
        </View>
      ) : null}

      <AppButton
        title={t('account.deleteAccount')}
        variant="destructive"
        icon="trash-outline"
        onPress={() => setConfirming(true)}
        disabled={(withPassword && !password) || needsSignIn}
        testID="delete-account-submit"
      />

      <ConfirmationModal
        visible={confirming}
        title={t('security.deleteConfirmTitle')}
        message={t('security.deleteConfirmBody')}
        confirmLabel={t('security.deleteConfirm')}
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
        testID="delete-account-confirm"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { marginTop: 8 },
  actions: { gap: 8 },
});
