import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}

export function ConfirmationModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
  testID,
}: ConfirmationModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const handleConfirm = () => {
    void Haptics.notificationAsync(
      destructive ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
    ).catch(() => undefined);
    onConfirm();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.backdrop}>
        {/* Tap-outside dismissal for touch users; screen readers use the Cancel button. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
        <View
          accessibilityViewIsModal
          testID={testID}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderRadius: theme.radius.xl,
              padding: theme.spacing.xxl,
            },
          ]}
        >
          <AppText variant="title3" accessibilityRole="header">
            {title}
          </AppText>
          {message ? (
            <AppText variant="callout" color="textSecondary">
              {message}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <AppButton
              title={confirmLabel ?? t('common.confirm')}
              variant={destructive ? 'destructive' : 'primary'}
              onPress={handleConfirm}
              loading={loading}
            />
            <AppButton
              title={cancelLabel ?? t('common.cancel')}
              variant="ghost"
              onPress={onCancel}
              disabled={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { gap: 12, maxWidth: 480, width: '100%', alignSelf: 'center' },
  actions: { gap: 8, marginTop: 8 },
});
