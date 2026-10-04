import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { queryKeys } from '@/lib/queryKeys';

import { accountSigningClient } from './api';
import { SigningFlow } from './SigningFlow';

/** In-app signing for a signed-in recipient (SPEC §5.5): documents/[id]/sign. */
export function InAppSigningScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const client = useMemo(() => accountSigningClient(id), [id]);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/documents/[id]', params: { id } });
  return (
    <SigningFlow
      client={client}
      onExit={back}
      onViewDetails={back}
      onChanged={() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      }}
    />
  );
}
