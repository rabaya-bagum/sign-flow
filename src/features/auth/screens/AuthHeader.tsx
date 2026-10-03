import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components';

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.container}>
      <AppText variant="title1" accessibilityRole="header">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="callout" color="textSecondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, marginTop: 8, marginBottom: 28 },
});
