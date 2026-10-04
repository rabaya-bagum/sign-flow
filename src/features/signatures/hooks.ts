import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppError } from '@shared/errors';

import { useCurrentUserId } from '@/features/auth/store';
import { queryKeys } from '@/lib/queryKeys';

import {
  deleteSignature,
  listSavedSignatures,
  saveSignature,
  setDefaultSignature,
  SIGNATURE_URL_TTL_SECONDS,
  signatureImageUrl,
  type SaveSignatureInput,
} from './api';
import type { SavedSignature, SignatureKind } from './types';

export function useSavedSignatures(kind?: SignatureKind) {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: queryKeys.signatures.list(),
    queryFn: listSavedSignatures,
    enabled: Boolean(userId),
    select: kind ? (rows: SavedSignature[]) => rows.filter((r) => r.kind === kind) : undefined,
  });
}

/** Short-lived signed URL for a saved signature image, held in memory only and refreshed before expiry. */
export function useSignatureImageUrl(path: string) {
  return useQuery({
    queryKey: queryKeys.signatures.imageUrl(path),
    queryFn: () => signatureImageUrl(path),
    staleTime: (SIGNATURE_URL_TTL_SECONDS - 60) * 1000,
  });
}

export function useSaveSignature() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<SaveSignatureInput, 'userId'>) => {
      if (!userId) throw new AppError('FORBIDDEN');
      return saveSignature({ ...input, userId });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.signatures.list() }),
  });
}

export function useSetDefaultSignature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signature: SavedSignature) => setDefaultSignature(signature.id),
    onMutate: (signature) => {
      queryClient.setQueryData<SavedSignature[]>(queryKeys.signatures.list(), (rows) =>
        rows?.map((r) => (r.kind === signature.kind ? { ...r, is_default: r.id === signature.id } : r)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.signatures.list() }),
  });
}

export function useDeleteSignature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSignature,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.signatures.list() }),
  });
}
