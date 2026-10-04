import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, EmptyState, Screen } from '@/components';
import type en from '@/i18n/en.json';

export type PlaceholderKey = `placeholders.${keyof (typeof en)['placeholders']}`;

interface PlaceholderScreenProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  titleKey: PlaceholderKey;
  bodyKey: PlaceholderKey;
  /** The build phase that delivers this screen (shown as a visible label). */
  phase: number;
  /** Optional large title shown above the empty state (e.g. a document title). */
  heading?: string;
  /** Tab screens draw their own large title; modals rely on the header. */
  largeTitle?: boolean;
  children?: React.ReactNode;
}

/** Clearly-labelled stand-in for screens delivered by later phases (no fake data). */
export function PlaceholderScreen({
  icon,
  titleKey,
  bodyKey,
  phase,
  heading,
  largeTitle,
  children,
}: PlaceholderScreenProps) {
  const { t } = useTranslation();
  return (
    <Screen scroll edges={largeTitle ? ['top'] : ['bottom']}>
      {largeTitle ? (
        <AppText variant="largeTitle" accessibilityRole="header" style={{ marginTop: 8 }}>
          {t(titleKey)}
        </AppText>
      ) : null}
      {heading ? (
        <AppText variant="title2" accessibilityRole="header" style={{ marginTop: 16 }}>
          {heading}
        </AppText>
      ) : null}
      {children}
      <EmptyState
        icon={icon}
        title={t(titleKey)}
        body={t(bodyKey)}
        tag={t('common.comingInPhase', { phase })}
        testID="placeholder"
      />
    </Screen>
  );
}
