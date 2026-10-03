import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { AppButton, AppText, Screen, TextLink } from '@/components';
import { usePreferencesStore } from '@/store/preferences';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const CARDS = [
  { key: 'card1', icon: 'create-outline' },
  { key: 'card2', icon: 'people-outline' },
  { key: 'card3', icon: 'pulse-outline' },
] as const satisfies readonly { key: 'card1' | 'card2' | 'card3'; icon: IconName }[];

export function OnboardingScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<(typeof CARDS)[number]>>(null);
  const [index, setIndex] = useState(0);
  const setOnboardingSeen = usePreferencesStore((s) => s.setOnboardingSeen);
  const isLast = index === CARDS.length - 1;

  const finish = () => {
    setOnboardingSeen(true);
    router.replace('/welcome');
  };

  const next = () => {
    if (isLast) return finish();
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    setIndex(index + 1);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)));
  };

  return (
    <Screen padded={false}>
      <View style={[styles.skip, { paddingHorizontal: theme.spacing.lg }]}>
        {!isLast ? <TextLink title={t('onboarding.skip')} onPress={finish} testID="onboarding-skip" /> : null}
      </View>
      <FlatList
        ref={listRef}
        data={CARDS}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        keyExtractor={(item) => item.key}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[styles.card, { width, paddingHorizontal: theme.spacing.xxxl }]}>
            <View
              style={[
                styles.illustration,
                { backgroundColor: theme.colors.primarySubtle, borderRadius: theme.radius.full },
              ]}
            >
              <Ionicons name={item.icon} size={64} color={theme.colors.primary} />
            </View>
            <AppText variant="title1" align="center" accessibilityRole="header">
              {t(`onboarding.${item.key}Title`)}
            </AppText>
            <AppText variant="body" color="textSecondary" align="center">
              {t(`onboarding.${item.key}Body`)}
            </AppText>
          </View>
        )}
      />
      <View style={[styles.footer, { paddingHorizontal: theme.spacing.lg }]}>
        <View
          style={styles.dots}
          accessible
          accessibilityRole="text"
          accessibilityLabel={t('onboarding.pageIndicator', { current: index + 1, total: CARDS.length })}
        >
          {CARDS.map((card, i) => (
            <View
              key={card.key}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? theme.colors.primary : theme.colors.border,
                  width: i === index ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>
        <AppButton
          title={isLast ? t('onboarding.getStarted') : t('onboarding.next')}
          onPress={next}
          testID="onboarding-next"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skip: { alignItems: 'flex-end', minHeight: 44 },
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  illustration: { width: 144, height: 144, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  footer: { gap: 24, paddingBottom: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { height: 8, borderRadius: 4 },
});
