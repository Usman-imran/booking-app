import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';

import { ApiRequestError, NetworkError } from './api/client';
import { createOrder, type OrderDetail } from './api/orders';
import { loadCache, refreshCache } from './offline/offlineCache';
import { isOnline, subscribeToNetwork } from './offline/network';
import {
  enqueueOrder,
  getQueue,
  loadQueue,
  removeFromQueue,
  updateQueuedOrder,
  type PendingOrder,
} from './offline/offlineQueue';

// Sends the offline queue to POST /api/orders, oldest first, one at a time,
// whenever there is a connection: when NetInfo reports one, when the app
// returns to the foreground, when an order is queued, and on a backoff
// timer after a failure.
//
// Nothing is ever dropped here. An order leaves the queue only when the
// server has returned it; every failure keeps it and records why. A retry
// is always safe because each order carries its clientRef - if an earlier
// attempt did land (the response was lost), the server returns that order
// rather than booking a second one.

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 15 * 60_000;
// Long enough for a Render instance to wake from a cold start.
const SYNC_TIMEOUT_MS = 60_000;

// 5s, 10s, 20s ... capped at 15 min, with ±20% jitter so a fleet of phones
// coming back online together don't retry in lockstep.
function backoffDelay(attempts: number) {
  const delay = Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
  return delay * (0.8 + Math.random() * 0.4);
}

// The server looked at the order and refused it (customer or product
// deactivated meanwhile, a validation rule). Resending the same body gets
// the same answer, so it's parked for the booker. 401 (session), 408, 429
// and 5xx are about the moment, not the order, and are retried.
function isRejection(err: unknown) {
  return (
    err instanceof ApiRequestError && err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status)
  );
}

let activeUser: number | null = null;
// Set by a 401: the token is no longer accepted, and every attempt would
// fail the same way until the booker signs in again (which restarts this
// service and clears it).
let authBlocked = false;
let flushing: Promise<void> | null = null;
let rerunRequested = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// --- Observable state -------------------------------------------------

const syncedListeners = new Set<(clientRef: string, order: OrderDetail) => void>();
const syncingListeners = new Set<() => void>();

// Fires when a queued order has been saved on the server - the moment the
// temporary local order is replaced by the real one.
export function onOrderSynced(listener: (clientRef: string, order: OrderDetail) => void) {
  syncedListeners.add(listener);
  return () => {
    syncedListeners.delete(listener);
  };
}

function subscribeToSyncing(listener: () => void) {
  syncingListeners.add(listener);
  return () => {
    syncingListeners.delete(listener);
  };
}

export function useIsSyncing() {
  return useSyncExternalStore(subscribeToSyncing, () => flushing !== null);
}

// --- Flushing ---------------------------------------------------------

function clearRetryTimer() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

// Wakes up for the next order whose backoff runs out.
async function scheduleRetry() {
  clearRetryTimer();
  if (activeUser === null || authBlocked) return;
  const waiting = (await getQueue()).filter((order) => order.syncState === 'pending');
  if (waiting.length === 0) return;
  const soonest = Math.min(...waiting.map((order) => order.nextAttemptAt));
  retryTimer = setTimeout(() => flushQueue(), Math.max(soonest - Date.now(), 1_000));
}

// 'next' moves on to the next order; 'stop' ends this pass (no connection,
// session rejected, or the user changed mid-request).
async function syncOne(order: PendingOrder): Promise<'next' | 'stop'> {
  const forUser = activeUser;
  try {
    const { order: saved } = await createOrder(
      { ...order.input, status: order.status, clientRef: order.clientRef },
      { timeoutMs: SYNC_TIMEOUT_MS }
    );
    // Signed out while the request was in flight. The order IS on the
    // server, but it stays in that user's stored queue; their next sign-in
    // resends it, and the server replays it instead of duplicating it.
    if (activeUser !== forUser) return 'stop';
    await removeFromQueue(order.clientRef);
    syncedListeners.forEach((listener) => listener(order.clientRef, saved));
    return 'next';
  } catch (err) {
    if (activeUser !== forUser) return 'stop';
    const message = err instanceof Error ? err.message : 'Something went wrong.';

    if (err instanceof ApiRequestError && err.status === 401) {
      authBlocked = true;
      await updateQueuedOrder(order.clientRef, { lastError: 'Your session has expired. Sign in again to sync.' });
      return 'stop';
    }

    const attempts = order.attempts + 1;
    if (isRejection(err)) {
      await updateQueuedOrder(order.clientRef, { syncState: 'failed', attempts, lastError: message });
      return 'next';
    }

    await updateQueuedOrder(order.clientRef, {
      attempts,
      lastError: message,
      nextAttemptAt: Date.now() + backoffDelay(attempts),
    });
    // No connection: every other order would fail the same way.
    return err instanceof NetworkError ? 'stop' : 'next';
  }
}

async function runPass(ignoreBackoff: boolean) {
  // Each order is tried at most once per pass, so a failing one can't spin.
  const tried = new Set<string>();
  while (activeUser !== null && !authBlocked && isOnline()) {
    const now = Date.now();
    const next = (await getQueue()).find(
      (order) =>
        order.syncState === 'pending' && !tried.has(order.clientRef) && (ignoreBackoff || order.nextAttemptAt <= now)
    );
    if (!next) return;
    tried.add(next.clientRef);
    if ((await syncOne(next)) === 'stop') return;
  }
}

// Sends every order that is due. Calls made while a pass is running share
// it, and trigger one more pass afterwards so nothing queued meanwhile is
// left waiting for the timer.
//
// `ignoreBackoff`: the connection just came back or the app was reopened -
// the likeliest moment for a retry to work, so waiting out a backoff
// earned while offline would only delay it.
export function flushQueue({ ignoreBackoff = false }: { ignoreBackoff?: boolean } = {}): Promise<void> {
  if (flushing) {
    rerunRequested = true;
    return flushing;
  }
  clearRetryTimer();
  flushing = runPass(ignoreBackoff)
    .catch((err) => console.warn('[sync] pass stopped:', err))
    .finally(() => {
      flushing = null;
      syncingListeners.forEach((listener) => listener());
      if (rerunRequested) {
        rerunRequested = false;
        flushQueue();
      } else {
        scheduleRetry();
      }
    });
  syncingListeners.forEach((listener) => listener());
  return flushing;
}

// --- Actions for the UI -------------------------------------------------

// Stores an order for sending later, then tries to send it straight away
// (the connection may only have blipped). Rejects if it couldn't be stored.
export async function queueOrder(order: Omit<PendingOrder, 'syncState' | 'attempts' | 'nextAttemptAt' | 'lastError'>) {
  await enqueueOrder({ ...order, syncState: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null });
  flushQueue();
}

// Puts a rejected (or backing-off) order back in line and tries it now.
export async function retryQueuedOrder(clientRef: string) {
  await updateQueuedOrder(clientRef, { syncState: 'pending', nextAttemptAt: 0 });
  flushQueue({ ignoreBackoff: true });
}

export function discardQueuedOrder(clientRef: string) {
  return removeFromQueue(clientRef);
}

// --- Lifecycle ----------------------------------------------------------

// Runs for as long as `userId` is signed in; returns the stop function.
export function startSyncService(userId: number) {
  activeUser = userId;
  authBlocked = false;

  loadQueue(userId).then(() => flushQueue({ ignoreBackoff: true }));
  loadCache(userId).then(() => {
    if (isOnline()) refreshCache();
  });

  const unsubscribeNetwork = subscribeToNetwork((online) => {
    if (!online) return;
    flushQueue({ ignoreBackoff: true });
    refreshCache();
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active' && isOnline()) flushQueue({ ignoreBackoff: true });
  });

  return () => {
    unsubscribeNetwork();
    appState.remove();
    clearRetryTimer();
    activeUser = null;
    loadQueue(null);
    loadCache(null);
  };
}
