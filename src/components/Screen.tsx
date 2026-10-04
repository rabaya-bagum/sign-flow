import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (forms, long content). */
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens usually omit 'bottom' (the tab bar handles it). */
  edges?: Edge[];
  /** Horizontal padding; defaults to the 16pt gutter. */
  padded?: boolean;
  background?: 'background' | 'surface';
  contentStyle?: ViewStyle;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
  testID?: string;
}

export function Screen({
  children,
  scroll = false,
  edges = ['top', 'bottom'],
  padded = true,
  background = 'background',
  contentStyle,
  refreshControl,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const padding = padded ? { paddingHorizontal: theme.spacing.lg } : null;

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.flex, { backgroundColor: theme.colors[background] }]}
      testID={testID}
    >
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, padding, contentStyle]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            refreshControl={refreshControl}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, padding, contentStyle]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
});
