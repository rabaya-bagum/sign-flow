import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, ConfirmationModal, InlineAlert, ListRow, Screen, SwitchRow } from '@/components';
import { listTotpFactors } from '@/features/auth/mfa';
import { useAuthStore } from '@/features/auth/store';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { queryKeys } from '@/lib/queryKeys';
import { useTheme } from '@/theme';

import { hasPassword, signOutOtherDevices } from './api';
import { authenticate, biometricAvailability, type BiometricAvailability, useAppLockStore } from './appLock';

/** Account → Security (SPEC §5.10): password, biometric unlock, 2FA, other devices. */
export function SecurityScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const session = useAuthStore((s) => s.session);
  const lockEnabled = useAppLockStore((s) => s.enabled);
  const setLockEnabled = useAppLockStore((s) => s.setEnabled);
  const [biometrics, setBiometrics] = useState<BiometricAvailability | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const factors = useQuery({ queryKey: queryKeys.security.factors(), queryFn: listTotpFactors });

  useEffect(() => {
    void biometricAvailability().then(setBiometrics);
  }, []);

  const toggleLock = async (on: boolean) => {
    if (!on) return setLockEnabled(false);
    // Prove it works before relying on it.
    if (await authenticate(t('appLock.enablePrompt'), t('common.cancel'))) setLockEnabled(true);
  };

  const signOutOthers = async () => {
    setBusy(true);
    try {
      await signOutOtherDevices();
      setNotice({ tone: 'success', text: t('security.otherDevicesDone') });
    } catch (e) {
      setNotice({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
      setConfirmOthers(false);
    }
  };

  const twoFactorOn = (factors.data?.length ?? 0) > 0;
  const biometricSubtitle =
    biometrics === 'unsupported'
      ? t('security.biometricsUnsupported')
      : biometrics === 'notEnrolled'
        ? t('security.biometricsNotEnrolled')
        : t('security.biometricsHint');

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={{ paddingTop: theme.spacing.lg, gap: theme.spacing.lg }}
      testID="security-screen"
    >
      {notice ? <InlineAlert tone={notice.tone} message={notice.text} /> : null}
      <Card padded={false}>
        {hasPassword(session) ? (
          <ListRow
            title={t('account.changePassword')}
            icon="key-outline"
            onPress={() => router.push('/account/change-password')}
            separator
            testID="security-password"
          />
        ) : null}
        <ListRow
          title={t('account.twoFactor')}
          icon="shield-checkmark-outline"
          value={factors.data ? (twoFactorOn ? t('security.on') : t('security.off')) : undefined}
          onPress={() => router.push('/account/two-factor')}
          testID="security-two-factor"
        />
      </Card>

      <Card padded={false}>
        <SwitchRow
          title={t('account.biometrics')}
          subtitle={biometricSubtitle}
          value={lockEnabled}
          onValueChange={(on) => void toggleLock(on)}
          disabled={biometrics !== 'available'}
          testID="security-biometrics"
        />
      </Card>

      <View style={styles.section}>
        <Card padded={false}>
          <ListRow
            title={t('account.otherDevices')}
            icon="phone-portrait-outline"
            onPress={() => setConfirmOthers(true)}
            testID="security-other-devices"
          />
        </Card>
        <AppText variant="footnote" color="textSecondary" style={styles.footnote}>
          {t('security.otherDevicesHint')}
        </AppText>
      </View>

      <ConfirmationModal
        visible={confirmOthers}
        title={t('account.otherDevices')}
        message={t('security.otherDevicesConfirm')}
        confirmLabel={t('security.signOutOthers')}
        loading={busy}
        onConfirm={() => void signOutOthers()}
        onCancel={() => setConfirmOthers(false)}
        testID="other-devices-confirm"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  footnote: { marginHorizontal: 16 },
});
