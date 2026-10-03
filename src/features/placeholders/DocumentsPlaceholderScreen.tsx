import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components';
import { BUCKET_LABEL_KEYS, isDashboardBucket } from '@/features/home/buckets';
import { useTheme } from '@/theme';

import { PlaceholderScreen } from './PlaceholderScreen';

export function DocumentsPlaceholderScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { bucket } = useLocalSearchParams<{ bucket?: string }>();
  const filter = isDashboardBucket(bucket) ? t(BUCKET_LABEL_KEYS[bucket]) : null;

  return (
    <PlaceholderScreen
      icon="folder-open-outline"
      titleKey="placeholders.documentsTitle"
      bodyKey="placeholders.documentsBody"
      phase={2}
      largeTitle
    >
      {filter ? (
        <View
          style={[
            styles.chip,
            { backgroundColor: theme.colors.primarySubtle, borderRadius: theme.radius.full },
          ]}
          testID="documents-filter"
        >
          <AppText variant="subhead" color="primary" weight="600">
            {t('placeholders.filterLabel', { filter })}
          </AppText>
        </View>
      ) : null}
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, marginTop: 16 },
});
