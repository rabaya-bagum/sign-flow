// Central TanStack Query keys. Every query key in the app comes from here.
export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => ['dashboard', 'summary'] as const,
    recent: (limit: number) => ['dashboard', 'recent', limit] as const,
  },
} as const;
