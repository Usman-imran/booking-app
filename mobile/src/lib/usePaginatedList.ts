import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Pagination } from './api/orders';

type Fetcher<T> = (page: number, search: string) => Promise<{ items: T[]; pagination: Pagination }>;

// Search-as-you-type, pull-to-refresh and infinite scroll for the list tabs.
// The fetcher is given the page and the (debounced) search text and returns
// one page; the hook takes care of appending pages and of discarding
// responses that come back after the query has already changed. Callers
// memoize the fetcher (useCallback) - a new fetcher means a fresh load, which
// is how filters such as the order status chips trigger a reload.
export function usePaginatedList<T>(fetcher: Fetcher<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Bumped on every fresh load so a slow earlier request can't overwrite
  // the results of a newer one.
  const requestId = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  // 'initial' shows the full-screen spinner, 'refresh' the pull-to-refresh
  // one, and 'silent' neither - used when returning to a list that is
  // already showing data and only needs to catch up.
  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      const id = ++requestId.current;
      setError(null);
      if (mode === 'initial') setStatus('loading');
      else if (mode === 'refresh') setIsRefreshing(true);

      try {
        const result = await fetcher(1, debouncedSearch);
        if (id !== requestId.current) return;
        setItems(result.items);
        setPagination(result.pagination);
        setStatus('ready');
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        setStatus('error');
      } finally {
        if (id === requestId.current) setIsRefreshing(false);
      }
    },
    [fetcher, debouncedSearch]
  );

  useEffect(() => {
    // load flips status to 'loading' synchronously, then only touches state
    // again after its internal `await` - the lint rule can't see across that
    // boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('initial');
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!pagination || isLoadingMore || status !== 'ready') return;
    if (pagination.page >= pagination.totalPages) return;

    const id = requestId.current;
    setIsLoadingMore(true);
    try {
      const result = await fetcher(pagination.page + 1, debouncedSearch);
      if (id !== requestId.current) return;
      setItems((current) => [...current, ...result.items]);
      setPagination(result.pagination);
    } catch {
      // A failed "load more" is not worth replacing the list with an error
      // screen; the user can scroll again to retry.
    } finally {
      if (id === requestId.current) setIsLoadingMore(false);
    }
  }, [fetcher, pagination, isLoadingMore, status, debouncedSearch]);

  const refresh = useCallback(() => load('refresh'), [load]);
  const retry = useCallback(() => load('initial'), [load]);
  const revalidate = useCallback(() => load('silent'), [load]);

  return {
    items,
    pagination,
    status,
    error,
    search,
    setSearch,
    isRefreshing,
    isLoadingMore,
    refresh,
    retry,
    revalidate,
    loadMore,
  };
}

// Re-runs `revalidate` each time the screen regains focus - after a record
// was added or edited on a pushed screen, say - but not on the first focus,
// which coincides with the mount that usePaginatedList already loads on.
// The callback is read through a ref so a changing identity (a new search)
// never re-triggers the effect while the screen stays focused.
export function useRevalidateOnFocus(revalidate: () => void) {
  const revalidateRef = useRef(revalidate);
  useEffect(() => {
    revalidateRef.current = revalidate;
  }, [revalidate]);
  const hasFocusedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      revalidateRef.current();
    }, [])
  );
}
