import { QueryClient } from '@tanstack/react-query';

import { isAppError } from '@shared/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Authorization/validation failures will not fix themselves.
        if (isAppError(error) && (error.code === 'FORBIDDEN' || error.code === 'INVALID_STATE')) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
