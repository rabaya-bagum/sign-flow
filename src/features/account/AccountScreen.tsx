import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  ActionSheet,
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
import { useStorageUsage } from '@/features/documents/hooks';
import { formatBytes } from '@/utils/formatBytes';
import * as ImagePicker from 'expo-image-picker';
import { usePreferencesStore } from '@/store/preferences';

import { useSavedSignatures } from '@/features/signatures/hooks';

import { useAvatarMutations, useAvatarUrl, useProfile } from './hooks';
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
  const [photoMenu, setPhotoMenu] = useState(false);
  const avatarUrl = useAvatarUrl(profile.data);
  const avatar = useAvatarMutations();
  const storage = useStorageUsage();
  const signatures = useSavedSignatures();

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) avatar.upload.mutate(uri, { onError: (e) => Alert.alert(t('errors.title'), errorMessage(e)) });
  };
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
            left={<Avatar name={profile.data.full_name} uri={avatarUrl.data} size={56} />}
            title={profile.data.full_name}
            subtitle={[profile.data.email, profile.data.phone].filter(Boolean).join(' · ')}
            onPress={() => router.push('/account/profile')}
            accessibilityHint={t('account.editProfile')}
            separator
            testID="account-profile"
          />
        )}
        {profile.data ? (
          <ListRow
            title={profile.data.avatar_path ? t('account.changePhoto') : t('account.addPhoto')}
            icon="camera-outline"
            iconColor="primary"
            onPress={() => (profile.data.avatar_path ? setPhotoMenu(true) : void choosePhoto())}
            right={
              avatar.upload.isPending || avatar.remove.isPending ? (
                <SkeletonBlock width={20} height={20} radius={10} />
              ) : undefined
            }
            testID="account-photo"
          />
        ) : null}
      </Section>

      <Section title={t('account.signature')}>
        <ListRow
          title={t('account.signaturesRow')}
          icon="create-outline"
          iconColor="primary"
          subtitle={
            signatures.data
              ? signatures.data.length
                ? t('account.signaturesSummary', {
                    signatures: signatures.data.filter((s) => s.kind === 'signature').length,
                    initials: signatures.data.filter((s) => s.kind === 'initials').length,
                  })
                : t('account.signaturesNone')
              : undefined
          }
          onPress={() => router.push('/account/signatures')}
          chevron
          testID="account-signatures"
        />
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
        <ListRow
          title={t('account.usedStorage')}
          value={
            storage.data
              ? t('account.storageSummary', {
                  size: formatBytes(storage.data.bytes),
                  count: storage.data.documentCount,
                })
              : undefined
          }
          testID="account-storage"
        />
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

      <ActionSheet
        visible={photoMenu}
        title={t('account.photoTitle')}
        onClose={() => setPhotoMenu(false)}
        closeLabel={t('common.close')}
        actions={[
          {
            key: 'change',
            label: t('account.changePhoto'),
            icon: 'images-outline',
            onPress: () => void choosePhoto(),
          },
          {
            key: 'remove',
            label: t('account.removePhoto'),
            icon: 'trash-outline',
            destructive: true,
            onPress: () =>
              avatar.remove.mutate(undefined, {
                onError: (e) => Alert.alert(t('errors.title'), errorMessage(e)),
              }),
          },
        ]}
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
