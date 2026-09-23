import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { ApiRequestError } from './api/client';
import { getPlan } from './api/auth';
import { readJson, userKey, writeJson } from './offline/storage';
import { FREE_DAILY_ORDER_LIMIT } from './plan';

// Today's new-order count for the Free plan's daily limit, kept on the
// device so the limit holds offline too (queued orders count) and the
// paywall can appear before a request is even sent.
//
// The server keeps the authoritative count and enforces it. The local one
// is merged with it - the higher wins - whenever the app can ask, so
// reinstalling or switching phones can't reset it, and orders made on
// another device are counted here too.
//
// It resets at midnight by construction: the count is stored against the
// local calendar date, and a stored count for any other date reads as 0.

type Stored = { date: string; count: number };

const KEY = 'usage.dailyOrders';

function todayKey() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// In memory for the signed-in user, mirrored to storage.
let state: { userId: number | null; date: string; count: number } = { userId: null, date: todayKey(), count: 0 };
const listeners = new Set<() => void>();

function emit(next: typeof state) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The count for today, 0 once the date has moved on.
function currentCount() {
  return state.date === todayKey() ? state.count : 0;
}

async function load(userId: number) {
  const stored = await readJson<Stored>(userKey(userId, KEY));
  const date = todayKey();
  const count = stored?.date === date && Number.isSafeInteger(stored.count) ? stored.count : 0;
  if (state.userId !== userId || state.date !== date || state.count < count) emit({ userId, date, count });
}

async function save(userId: number, count: number) {
  const date = todayKey();
  emit({ userId, date, count });
  await writeJson(userKey(userId, KEY), { date, count } satisfies Stored).catch(() => {});
}

// Serialised, so two orders recorded back to back can't lose an increment.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task);
  chain = next.catch(() => {});
  return next;
}

// Records one new order (online or queued offline).
export function recordOrderCreated(userId: number) {
  return serial(async () => {
    await load(userId);
    await save(userId, currentCount() + 1);
  }).catch(() => {});
}

// Takes the server's count when it is higher - orders from another device,
// or local storage cleared.
export function mergeServerCount(userId: number, ordersToday: number) {
  return serial(async () => {
    await load(userId);
    if (ordersToday > currentCount()) await save(userId, ordersToday);
  }).catch(() => {});
}

// Asks the server for today's usage and merges it. Quiet on failure: offline,
// the local count stands.
export async function refreshUsageFromServer(userId: number) {
  try {
    const plan = await getPlan();
    await mergeServerCount(userId, plan.ordersToday);
  } catch {
    // Offline or server unavailable - keep the local count.
  }
}

// The server refused an order for the daily limit: the day is used up,
// whatever the local count said.
export function isDailyLimitError(err: unknown) {
  if (!(err instanceof ApiRequestError) || err.status !== 402) return false;
  const details = (err.body as { error?: { details?: { code?: string } } } | null)?.error?.details;
  return details?.code === 'DAILY_LIMIT_REACHED';
}

export function markLimitReached(userId: number) {
  return mergeServerCount(userId, FREE_DAILY_ORDER_LIMIT);
}

// Today's usage for the signed-in user. `isPro` lifts the limit. Loads the
// stored count on mount and asks the server once, so the numbers are right
// by the time the booker saves.
export function useDailyUsage(userId: number | null, isPro: boolean) {
  const snapshot = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    if (userId === null) return;
    load(userId).catch(() => {});
    if (!isPro) refreshUsageFromServer(userId);
  }, [userId, isPro]);

  const used = snapshot.userId === userId && snapshot.date === todayKey() ? snapshot.count : 0;
  const limit = isPro ? null : FREE_DAILY_ORDER_LIMIT;
  const limitReached = limit !== null && used >= limit;

  const record = useCallback(() => (userId === null ? Promise.resolve() : recordOrderCreated(userId)), [userId]);

  return { used, limit, remaining: limit === null ? null : Math.max(limit - used, 0), limitReached, record };
}
