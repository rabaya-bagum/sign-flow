import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppInput, InlineAlert, Screen } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';

import { signOut } from '../api';
import { passSecondFactor } from '../mfa';
import { AuthHeader } from './AuthHeader';

export const TOTP_CODE = /^\d{6}$/;

/** After the first factor: the 6-digit code from the authenticator app (SPEC §5.10). */
export function TwoFactorChallengeScreen() {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = TOTP_CODE.test(code);

  const verify = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      // On success the session becomes aal2 and the root guards open the app.
      await passSecondFactor(code);
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    await signOut().catch(() => undefined);
    router.replace('/welcome');
  };

  return (
    <Screen scroll edges={['bottom']} testID="two-factor-challenge">
      <AuthHeader title={t('twoFactor.challengeTitle')} subtitle={t('twoFactor.challengeBody')} />
      {error ? <InlineAlert message={error} /> : null}
      <AppInput
        label={t('twoFactor.codeLabel')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        maxLength={6}
        returnKeyType="done"
        onSubmitEditing={() => void verify()}
        testID="two-factor-code"
      />
      <View style={styles.actions}>
        <AppButton
          title={t('twoFactor.verify')}
          onPress={() => void verify()}
          loading={busy}
          disabled={!valid}
          testID="two-factor-verify"
        />
        <AppButton title={t('twoFactor.useOtherAccount')} variant="ghost" onPress={() => void cancel()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
});
