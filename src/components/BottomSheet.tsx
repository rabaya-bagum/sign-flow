import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  testID?: string;
}

/** Modal sheet anchored to the bottom; content scrolls when tall. */
export function BottomSheet({
  visible,
  title,
  onClose,
  children,
  footer,
  closeLabel,
  testID,
}: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
        <View
          accessibilityViewIsModal
          testID={testID}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          <View style={[styles.header, { paddingHorizontal: theme.spacing.lg }]}>
            <AppText variant="headline" accessibilityRole="header" style={styles.title}>
              {title}
            </AppText>
            <IconButton
              icon="close"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              color="textSecondary"
            />
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}
            keyboardShouldPersistTaps="handled"
            tabIndex={0}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }}>
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  title: { flex: 1 },
  body: { flexGrow: 0 },
});
