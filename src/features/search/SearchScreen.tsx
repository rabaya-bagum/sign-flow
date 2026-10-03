import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppText, EmptyState, ErrorState, LoadingSkeleton, SearchField, StatusBadge } from '@/components';
import { useSearch } from '@/features/documents/hooks';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTheme } from '@/theme';

export function SearchScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const search = useSearch(debounced);
  const ready = debounced.trim().length >= 2;

  return (
    <View
      style={[styles.flex, { backgroundColor: theme.colors.background, padding: theme.spacing.lg }]}
      testID="search-screen"
    >
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={t('search.placeholder')}
        accessibilityLabel={t('search.title')}
        clearLabel={t('common.clear')}
        autoFocus
        testID="search-input"
      />
      {!ready ? (
        <AppText variant="footnote" color="textSecondary" style={styles.hint}>
          {t('search.hint')}
        </AppText>
      ) : search.isPending ? (
        <LoadingSkeleton rows={3} />
      ) : search.isError ? (
        <ErrorState message={errorMessage(search.error)} onRetry={() => void search.refetch()} />
      ) : (
        <FlatList
          data={search.data}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: theme.spacing.md, gap: theme.spacing.sm }}
          ListHeaderComponent={
            search.data.length ? (
              <AppText variant="footnote" color="textSecondary" accessibilityLiveRegion="polite">
                {t('search.results', { count: search.data.length })}
              </AppText>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={t('search.title')}
              body={t('documents.emptySearch')}
              testID="search-empty"
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/documents/[id]', params: { id: item.id } })}
              accessibilityRole="button"
              accessibilityLabel={[
                item.title,
                t(`status.${item.displayStatus}`),
                item.matchedRecipientName
                  ? t('search.matched', {
                      name: item.matchedRecipientName,
                      email: item.matchedRecipientEmail,
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(', ')}
              style={({ pressed }) => [
                styles.result,
                {
                  backgroundColor: pressed ? theme.colors.surface : theme.colors.surfaceElevated,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                },
              ]}
              testID={`search-result-${item.id}`}
            >
              <AppText variant="headline" numberOfLines={2}>
                {item.title}
              </AppText>
              <StatusBadge status={item.displayStatus} />
              {item.matchedRecipientName ? (
                <AppText variant="footnote" color="textSecondary" numberOfLines={1}>
                  {t('search.matched', {
                    name: item.matchedRecipientName,
                    email: item.matchedRecipientEmail,
                  })}
                </AppText>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hint: { marginTop: 12 },
  result: { padding: 12, gap: 6, borderWidth: StyleSheet.hairlineWidth * 2 },
});
