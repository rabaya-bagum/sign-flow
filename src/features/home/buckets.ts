// Dashboard buckets (SPEC §6.3) and their navigation param for the Documents tab.
export const DASHBOARD_BUCKETS = ['needs_signature', 'waiting', 'draft', 'completed'] as const;
export type DashboardBucket = (typeof DASHBOARD_BUCKETS)[number];

export function isDashboardBucket(value: unknown): value is DashboardBucket {
  return typeof value === 'string' && (DASHBOARD_BUCKETS as readonly string[]).includes(value);
}

export const BUCKET_LABEL_KEYS = {
  needs_signature: 'home.needsSignature',
  waiting: 'home.waiting',
  draft: 'home.drafts',
  completed: 'home.completed',
} as const satisfies Record<DashboardBucket, string>;
