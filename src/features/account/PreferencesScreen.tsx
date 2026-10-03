import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Card, InlineAlert, ListRow, Screen } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { usePreferencesStore } from '@/store/preferences';
import { useTheme } from '@/theme';

import { useSetTheme } from './hooks';
import { THEME_OPTIONS, themeLabelKey } from './themeLabels';

export function PreferencesScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const current = usePreferencesStore((s) => s.theme);
  const setTheme = useSetTheme();

  return (
    <Screen scroll edges={['bottom']} contentStyle={{ paddingTop: 16 }}>
      <AppText
        variant="footnote"
        color="textSecondary"
        weight="600"
        style={{ marginBottom: 8, marginLeft: 16 }}
      >
        {t('account.theme').toUpperCase()}
      </AppText>
      {setTheme.isError ? <InlineAlert message={errorMessage(setTheme.error)} /> : null}
      <Card padded={false}>
        <View accessibilityRole="radiogroup">
          {THEME_OPTIONS.map((option, i) => {
            const selected = option === current;
            return (
              <ListRow
                key={option}
                title={t(themeLabelKey(option))}
                chevron={false}
                onPress={() => setTheme.mutate(option)}
                separator={i < THEME_OPTIONS.length - 1}
                right={
                  selected ? <Ionicons name="checkmark" size={20} color={theme.colors.primary} /> : undefined
                }
                accessibilityLabel={t(themeLabelKey(option))}
                testID={`theme-${option}`}
              />
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}
