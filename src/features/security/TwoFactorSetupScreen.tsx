import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppInput,
  AppText,
  Card,
  ConfirmationModal,
  ErrorState,
  InlineAlert,
  LoadingSkeleton,
  Screen,
} from '@/components';
import {
  enrollTotp,
  listTotpFactors,
  removeTotp,
  type TotpEnrollment,
  verifyTotp,
} from '@/features/auth/mfa';
import { TOTP_CODE } from '@/features/auth/screens/TwoFactorChallengeScreen';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { queryKeys } from '@/lib/queryKeys';
import { useTheme } from '@/theme';

/** Account → Security → Two-factor authentication: set up or turn off an authenticator app (TOTP). */
export function TwoFactorSetupScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const queryClient = useQueryClient();
  const factors = useQuery({ queryKey: queryKeys.security.factors(), queryFn: listTotpFactors });
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.security.factors() });

  const start = () =>
    run(async () => {
      setDone(null);
      setEnrollment(await enrollTotp());
    });
  const confirm = () =>
    run(async () => {
      if (!enrollment) return;
      try {
        await verifyTotp(enrollment.factorId, code);
      } finally {
        setCode('');
      }
      setEnrollment(null);
      setDone(t('twoFactor.enabled'));
      await refresh();
    });
  const turnOff = (factorId: string) =>
    run(async () => {
      await removeTotp(factorId);
      setConfirmOff(false);
      setDone(t('twoFactor.disabled'));
      await refresh();
    });

  if (factors.isPending) return <LoadingSkeleton rows={3} />;
  if (factors.isError)
    return <ErrorState message={errorMessage(factors.error)} onRetry={() => void factors.refetch()} />;
  const active = factors.data[0];

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={{ paddingTop: theme.spacing.lg, gap: theme.spacing.lg }}
      testID="two-factor-setup"
    >
      {error ? <InlineAlert message={error} /> : null}
      {done ? <InlineAlert tone="success" message={done} /> : null}

      {active ? (
        <Card>
          <AppText variant="headline">{t('twoFactor.onTitle')}</AppText>
          <AppText color="textSecondary" style={styles.gap}>
            {t('twoFactor.onBody')}
          </AppText>
          <AppButton
            title={t('twoFactor.turnOff')}
            variant="destructive"
            onPress={() => setConfirmOff(true)}
            testID="two-factor-off"
          />
        </Card>
      ) : enrollment ? (
        <Card>
          <AppText variant="headline">{t('twoFactor.scanTitle')}</AppText>
          <AppText color="textSecondary" style={styles.gap}>
            {t('twoFactor.scanBody')}
          </AppText>
          <View style={[styles.qr, { backgroundColor: '#FFFFFF' }]}>
            <Image
              source={{ uri: enrollment.qrCode }}
              style={styles.qrImage}
              contentFit="contain"
              accessibilityLabel={t('twoFactor.qrLabel')}
            />
          </View>
          {Platform.OS !== 'web' ? (
            <AppButton
              title={t('twoFactor.openApp')}
              variant="secondary"
              icon="open-outline"
              onPress={() => void Linking.openURL(enrollment.uri).catch(() => undefined)}
            />
          ) : null}
          <AppText variant="footnote" color="textSecondary" style={styles.gap}>
            {t('twoFactor.manualKey')}
          </AppText>
          <AppText selectable variant="callout" style={styles.secret} testID="two-factor-secret">
            {enrollment.secret.replace(/(.{4})/g, '$1 ').trim()}
          </AppText>
          <AppInput
            label={t('twoFactor.codeLabel')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            testID="two-factor-setup-code"
          />
          <AppButton
            title={t('twoFactor.confirm')}
            onPress={() => void confirm()}
            loading={busy}
            disabled={!TOTP_CODE.test(code)}
            testID="two-factor-confirm"
          />
        </Card>
      ) : (
        <Card>
          <AppText variant="headline">{t('twoFactor.offTitle')}</AppText>
          <AppText color="textSecondary" style={styles.gap}>
            {t('twoFactor.offBody')}
          </AppText>
          <AppButton
            title={t('twoFactor.setUp')}
            onPress={() => void start()}
            loading={busy}
            testID="two-factor-start"
          />
        </Card>
      )}

      {active ? (
        <ConfirmationModal
          visible={confirmOff}
          title={t('twoFactor.turnOffTitle')}
          message={t('twoFactor.turnOffBody')}
          confirmLabel={t('twoFactor.turnOff')}
          destructive
          loading={busy}
          onConfirm={() => void turnOff(active.id)}
          onCancel={() => setConfirmOff(false)}
          testID="two-factor-off-confirm"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 4, marginBottom: 12 },
  qr: { alignSelf: 'center', padding: 12, borderRadius: 12, marginBottom: 12 },
  qrImage: { width: 200, height: 200 },
  secret: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    marginBottom: 12,
  },
});
