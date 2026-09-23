import { useCallback, useEffect, useState } from 'react';

import apiClient from './api/client';

export type SyncState = 'checking' | 'online' | 'offline';

// Whether the app can currently reach its backend.
//
// The app has no offline queue - every order is written straight to the
// server - so "sync" here means exactly one thing: is the server reachable
// from this device right now. That is the question a booker standing in a
// shop with one bar of signal actually has, and the profile screen answers
// it rather than making them find out by losing an order.
export function useSyncStatus() {
  const [state, setState] = useState<SyncState>('checking');
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const check = useCallback(async () => {
    setState('checking');
    try {
      await apiClient.get('/health');
      setState('online');
    } catch {
      setState('offline');
    } finally {
      setCheckedAt(new Date());
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
  }, [check]);

  return { state, checkedAt, check };
}
