import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';

export interface SheetAction {
  key: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  hint?: string;
  destructive?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  title: string;
  actions: SheetAction[];
  onClose: () => void;
  closeLabel: string;
  testID?: string;
}

export function ActionSheet({ visible, title, actions, onClose, closeLabel, testID }: ActionSheetProps) {
  const theme = useTheme();
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} closeLabel={closeLabel} testID={testID}>
      <View accessibilityRole="menu">
        {actions.map((action) => {
          const color = action.destructive ? theme.colors.danger : theme.colors.textPrimary;
          return (
            <Pressable
              key={action.key}
              accessibilityRole="menuitem"
              accessibilityLabel={action.label}
              accessibilityHint={action.hint}
              testID={`action-${action.key}`}
              onPress={() => {
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? theme.colors.surface : 'transparent',
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <Ionicons name={action.icon} size={22} color={color} />
              <View style={styles.text}>
                <AppText variant="body" style={{ color }}>
                  {action.label}
                </AppText>
                {action.hint ? (
                  <AppText variant="footnote" color="textSecondary">
                    {action.hint}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: MIN_TOUCH_TARGET + 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  text: { flex: 1, gap: 2 },
});
