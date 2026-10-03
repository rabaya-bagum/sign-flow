import { useTranslation } from 'react-i18next';

import { relativeTime } from '@/utils/relativeTime';

/** Formats a timestamp as "5m ago", "Yesterday", or a short date. */
export function useFormatRelativeTime() {
  const { t, i18n } = useTranslation();
  return (value: Date | string): string => {
    const r = relativeTime(value);
    switch (r.kind) {
      case 'justNow':
        return t('time.justNow');
      case 'minutes':
        return t('time.minutesAgo', { count: r.count });
      case 'hours':
        return t('time.hoursAgo', { count: r.count });
      case 'yesterday':
        return t('time.yesterday');
      case 'days':
        return t('time.daysAgo', { count: r.count });
      case 'date':
        return r.date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };
}
