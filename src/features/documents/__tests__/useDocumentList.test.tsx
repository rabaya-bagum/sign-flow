import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createTestQueryClient } from '@/test/render';

import * as api from '../api';
import { useDocumentList } from '../hooks';
import { EMPTY_FILTERS } from '../types';

jest.mock('../api', () => ({ listDocuments: jest.fn() }));
const mockList = jest.mocked(api.listDocuments);

const params = { bucket: 'all' as const, search: '', sort: 'newest' as const, filters: EMPTY_FILTERS };

describe('useDocumentList', () => {
  it('passes each page cursor to the next request and stops at the last page', async () => {
    mockList
      .mockResolvedValueOnce({ items: [{ id: 'a' } as never], nextCursor: { value: 'v1', id: 'a' } })
      .mockResolvedValueOnce({ items: [{ id: 'b' } as never], nextCursor: null });
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(() => useDocumentList(params), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockList).toHaveBeenNthCalledWith(1, params, null);
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(mockList).toHaveBeenNthCalledWith(2, params, { value: 'v1', id: 'a' });
    await waitFor(() =>
      expect(result.current.data?.pages.flatMap((p) => p.items.map((i) => i.id))).toEqual(['a', 'b']),
    );
    expect(result.current.hasNextPage).toBe(false);
  });
});
