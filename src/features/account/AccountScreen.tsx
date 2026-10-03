import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  Avatar,
  Card,
  ConfirmationModal,
  ErrorState,
  ListRow,
  Screen,
  SkeletonBlock,
} from '@/components';
import { LEGAL_URLS } from '@/constants/legal';
import { signOut } from '@/features/auth/api';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { openLink } from '@/lib/openLink';
import { usePreferencesStore } from '@/store/preferences';

import { useProfile } from './hooks';
import { themeLabelKey } from './themeLabels';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText
        variant="footnote"
        color="textSecondary"
        weight="600"
        style={styles.sectionTitle}
        accessibilityRole="header"
      >
        {title.toUpperCase()}
      </AppText>
      <Card padded={false}>{children}</Card>
    </View>
  );
}

export function AccountScreen() {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const profile = useProfile();
  const theme = usePreferencesStore((s) => s.theme);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const comingIn = (phase: number) => t('common.comingInPhase', { phase });

  const logout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      setLoggingOut(false);
      setConfirmLogout(false);
    }
  };

  return (
    <Screen scroll edges={['top']} testID="account-screen">
      <AppText variant="largeTitle" accessibilityRole="header" style={styles.title}>
        {t('account.title')}
      </AppText>

      <Section title={t('account.profile')}>
        {profile.isPending ? (
          <View style={styles.profileRow}>
            <SkeletonBlock width={56} height={56} radius={28} />
            <View style={styles.profileText}>
              <SkeletonBlock width="60%" />
              <SkeletonBlock width="80%" height={12} />
            </View>
          </View>
        ) : profile.isError ? (
          <ErrorState
            message={`${t('account.loadError')} ${errorMessage(profile.error)}`}
            onRetry={() => void profile.refetch()}
          />
        ) : (
          <ListRow
            left={<Avatar name={profile.data.full_name} size={56} />}
            title={profile.data.full_name}
            subtitle={[profile.data.email, profile.data.phone].filter(Boolean).join(' · ')}
            onPress={() => router.push('/account/profile')}
            accessibilityHint={t('account.editProfile')}
            testID="account-profile"
          />
        )}
      </Section>

      <Section title={t('account.signature')}>
        <ListRow title={t('account.savedSignature')} subtitle={comingIn(3)} disabled separator />
        <ListRow title={t('account.savedInitials')} subtitle={comingIn(3)} disabled />
      </Section>

      <Section title={t('account.security')}>
        <ListRow title={t('account.changePassword')} subtitle={comingIn(8)} disabled separator />
        <ListRow title={t('account.biometrics')} subtitle={comingIn(8)} disabled separator />
        <ListRow title={t('account.twoFactor')} subtitle={comingIn(8)} disabled separator />
        <ListRow title={t('account.otherDevices')} subtitle={comingIn(8)} disabled />
      </Section>

      <Section title={t('account.notifications')}>
        <ListRow title={t('account.notificationSettings')} subtitle={comingIn(7)} disabled />
      </Section>

      <Section title={t('account.preferences')}>
        <ListRow
          title={t('account.theme')}
          value={t(themeLabelKey(theme))}
          onPress={() => router.push('/account/preferences')}
          separator
          testID="account-theme"
        />
        <ListRow title={t('account.language')} value={t('account.languageEnglish')} separator />
        <ListRow title={t('account.defaultSigning')} subtitle={comingIn(5)} disabled />
      </Section>

      <Section title={t('account.storage')}>
        <ListRow title={t('account.usedStorage')} subtitle={comingIn(2)} disabled />
      </Section>

      <Section title={t('account.legal')}>
        <ListRow
          title={t('account.privacyPolicy')}
          icon="shield-checkmark-outline"
          accessibilityRole="link"
          accessibilityHint={t('common.openLink')}
          onPress={() => void openLink(LEGAL_URLS.privacy)}
          separator
        />
        <ListRow
          title={t('account.terms')}
          icon="document-outline"
          accessibilityRole="link"
          accessibilityHint={t('common.openLink')}
          onPress={() => void openLink(LEGAL_URLS.terms)}
          separator
        />
        <ListRow
          title={t('account.esignDisclosure')}
          icon="create-outline"
          accessibilityRole="link"
          accessibilityHint={t('common.openLink')}
          onPress={() => void openLink(LEGAL_URLS.esignDisclosure)}
        />
      </Section>

      <Section title={t('account.deleteAccount')}>
        <ListRow title={t('account.deleteAccount')} subtitle={comingIn(8)} titleColor="danger" disabled />
      </Section>

      <AppButton
        title={t('account.logout')}
        variant="destructive"
        icon="log-out-outline"
        onPress={() => setConfirmLogout(true)}
        style={styles.logout}
        testID="account-logout"
      />

      <ConfirmationModal
        visible={confirmLogout}
        title={t('account.logoutConfirmTitle')}
        message={t('account.logoutConfirmBody')}
        confirmLabel={t('account.logout')}
        destructive
        loading={loggingOut}
        onConfirm={() => void logout()}
        onCancel={() => setConfirmLogout(false)}
        testID="logout-confirm"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 8, marginBottom: 8 },
  section: { marginTop: 20 },
  sectionTitle: { marginBottom: 8, marginLeft: 16, letterSpacing: 0.5 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  profileText: { flex: 1, gap: 8 },
  logout: { marginTop: 28 },
});
