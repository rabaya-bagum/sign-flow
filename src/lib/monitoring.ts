import * as Sentry from '@sentry/react-native';

import { env } from './env';
import { scrubEvent, scrubValue } from './scrub';

/**
 * Crash reporting (SPEC §2, §14). Off unless EXPO_PUBLIC_SENTRY_DSN is set. No default PII, no
 * screenshots or view hierarchy (they could show documents or signatures), and every event and
 * breadcrumb goes through the scrubber.
 */
export const monitoringEnabled = env.sentryDsn.length > 0;

export function initMonitoring(): void {
  if (!monitoringEnabled) return;
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.appEnvironment,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: env.appEnvironment === 'production' ? 0.1 : 0,
    maxBreadcrumbs: 50,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) =>
      // Console output can contain anything; it is not sent.
      breadcrumb.category === 'console' ? null : scrubValue(breadcrumb),
  });
}

/** Ties reports to the account id only (never email or name). */
export function setMonitoringUser(userId: string | null): void {
  if (monitoringEnabled) Sentry.setUser(userId ? { id: userId } : null);
}

export const wrapRoot = <P extends Record<string, unknown>>(component: React.ComponentType<P>) =>
  monitoringEnabled ? Sentry.wrap(component) : component;
