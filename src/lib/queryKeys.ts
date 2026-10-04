// Central TanStack Query keys. Every query key in the app comes from here.
export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  documents: {
    all: ['documents'] as const,
    list: (params: unknown) => ['documents', 'list', params] as const,
    detail: (id: string) => ['documents', 'detail', id] as const,
    viewUrl: (id: string) => ['documents', 'view-url', id] as const,
    fields: (id: string) => ['documents', 'fields', id] as const,
    recipients: (id: string) => ['documents', 'recipients', id] as const,
    senders: () => ['documents', 'senders'] as const,
  },
  search: (query: string) => ['search', query] as const,
  storageUsage: () => ['storage-usage'] as const,
  avatarUrl: (path: string) => ['avatar-url', path] as const,
  signatures: {
    all: ['signatures'] as const,
    list: () => ['signatures', 'list'] as const,
    imageUrl: (path: string) => ['signatures', 'image-url', path] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    unread: () => ['notifications', 'unread'] as const,
    prefs: (userId: string) => ['notifications', 'prefs', userId] as const,
  },
  activity: {
    all: ['activity'] as const,
    feed: (types: readonly string[] | null) => ['activity', 'feed', types] as const,
    document: (id: string) => ['activity', 'document', id] as const,
  },
  /** Signing sessions hold short-lived URLs: never persisted, always refetched on open. */
  signing: (mode: 'account' | 'guest', key: string) => ['signing', mode, key] as const,
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => ['dashboard', 'summary'] as const,
    recent: (limit: number) => ['dashboard', 'recent', limit] as const,
  },
} as const;
