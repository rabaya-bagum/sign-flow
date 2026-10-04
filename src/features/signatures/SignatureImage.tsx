import { ActivityIndicator, Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { useSignatureImageUrl } from './hooks';

/** A saved signature on paper, loaded through a short-lived signed URL (memory only). */
export function SignatureImage({
  path,
  height = 64,
  style,
}: {
  path: string;
  height?: number;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const url = useSignatureImageUrl(path);
  return (
    <View
      style={[
        styles.box,
        { height, backgroundColor: theme.colors.paper, borderRadius: theme.radius.sm },
        style,
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {url.data ? (
        <Image source={{ uri: url.data, cache: 'reload' }} style={styles.image} resizeMode="contain" />
      ) : (
        <ActivityIndicator color={theme.colors.paperText} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', padding: 6, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
