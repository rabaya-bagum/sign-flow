import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppInput,
  AppText,
  Avatar,
  Card,
  Checkbox,
  ConfirmationModal,
  EmptyState,
  InlineAlert,
  ListRow,
  LoadingSkeleton,
  Screen,
  StatusBadge,
} from '@/components';
import { DISPLAY_STATUSES, ThemeProvider, typography, useTheme, type ColorScheme } from '@/theme';

// Dev-only route (/dev/components, guarded by __DEV__): every shared component in both themes.
// Strings here are intentionally untranslated sample content.
function Gallery() {
  const theme = useTheme();
  const [checked, setChecked] = useState(true);
  const [modal, setModal] = useState(false);

  return (
    <View style={[styles.panel, { backgroundColor: theme.colors.background, padding: theme.spacing.lg }]}>
      <AppText variant="title2">{theme.scheme} theme</AppText>
      {(Object.keys(typography) as (keyof typeof typography)[]).map((v) => (
        <AppText key={v} variant={v}>
          {v}
        </AppText>
      ))}
      <AppButton title="Primary" onPress={() => undefined} />
      <AppButton title="Secondary" variant="secondary" icon="add" onPress={() => undefined} />
      <AppButton title="Ghost" variant="ghost" onPress={() => undefined} />
      <AppButton title="Destructive" variant="destructive" onPress={() => setModal(true)} />
      <AppButton title="Loading" loading />
      <AppButton title="Disabled" disabled />
      <AppInput label="Email" placeholder="you@example.com" />
      <AppInput label="Password" secureTextEntry value="secret-value-1" hint="At least 10 characters." />
      <AppInput label="With error" value="nope" error="Enter a valid email address." />
      <Checkbox checked={checked} onChange={setChecked} accessibilityLabel="Accept">
        <AppText variant="subhead">Checkbox label</AppText>
      </Checkbox>
      <InlineAlert message="Inline error" />
      <InlineAlert message="Inline success" tone="success" />
      <View style={styles.badges}>
        {DISPLAY_STATUSES.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </View>
      <Card padded={false}>
        <ListRow title="List row" value="12" onPress={() => undefined} separator />
        <ListRow
          title="With subtitle"
          subtitle="Secondary text"
          icon="time-outline"
          onPress={() => undefined}
          separator
        />
        <ListRow title="Disabled" subtitle="Coming in Phase 3" disabled />
      </Card>
      <View style={styles.badges}>
        <Avatar name="John Doe" />
        <Avatar name="Aaliyah Fatimah" size={56} />
      </View>
      <Card padded={false}>
        <LoadingSkeleton rows={2} />
      </Card>
      <EmptyState
        title="Empty state"
        body="Body copy explains what to do next."
        actionLabel="Action"
        onAction={() => undefined}
        tag="Coming in Phase 2"
      />
      <ConfirmationModal
        visible={modal}
        title="Confirm?"
        message="Confirmation body."
        destructive
        onConfirm={() => setModal(false)}
        onCancel={() => setModal(false)}
      />
    </View>
  );
}

export function ComponentGallery() {
  const schemes: ColorScheme[] = ['light', 'dark'];
  return (
    <Screen scroll padded={false} edges={['bottom']}>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} scheme={scheme}>
          <Gallery />
        </ThemeProvider>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
