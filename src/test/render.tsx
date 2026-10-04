import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, type ColorScheme } from '@/theme';

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      // No GC timers: a pending 5-minute mutation GC timeout would keep Jest from exiting.
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

/** Renders with the app's providers (theme, safe area, a fresh query client). */
export function renderWithProviders(
  ui: ReactElement,
  {
    scheme = 'light',
    queryClient = createTestQueryClient(),
  }: { scheme?: ColorScheme; queryClient?: QueryClient } = {},
) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider scheme={scheme}>{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}
