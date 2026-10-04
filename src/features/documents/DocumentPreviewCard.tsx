import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components';
import { PdfSurface } from '@/features/viewer';
import { useTheme } from '@/theme';

import { useViewUrl } from './hooks';

/** First-page preview (static surface); tapping opens the full viewer. */
export function DocumentPreviewCard({ documentId, title }: { documentId: string; title: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const url = useViewUrl(documentId);
  const open = () => router.push({ pathname: '/documents/[id]/view', params: { id: documentId } });

  return (
    <Card padded={false} style={styles.card}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={t('viewer.previewOpen')}
        accessibilityHint={t('viewer.previewHint')}
        testID="details-preview"
      >
        <View
          style={[styles.preview, { backgroundColor: theme.colors.surface }]}
          accessibilityLabel={t('viewer.previewLabel', { title })}
          pointerEvents="none"
        >
          {url.data ? <PdfSurface url={url.data} interactive={false} /> : null}
        </View>
        <View style={[styles.footer, { padding: theme.spacing.md, borderTopColor: theme.colors.border }]}>
          <AppText variant="headline" color="primary">
            {t('viewer.previewOpen')}
          </AppText>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', marginTop: 16 },
  preview: { height: 260 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
});
