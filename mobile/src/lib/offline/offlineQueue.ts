import { useSyncExternalStore } from 'react';

import type { OrderInput } from '../api/orders';
import { readJson, userKey, writeJson } from './storage';

// An order booked while the server was out of reach, waiting to be sent.
export type PendingOrder = {
  // Generated when the booker tapped save. Doubles as the order's
  // temporary id in the UI and as the idempotency key the server
  // deduplicates retries on - so it must never change once queued.
  clientRef: string;
  status: 'draft' | 'submitted';
  // Exactly the body createOrder would have sent.
  input: OrderInput;
  // Display snapshot for the list. The figures are orderCalc's preview;
  // the server re-prices the order when it syncs.
  customer: { id: string; name: string; code: string };
  itemCount: number;
  total: number;
  createdAt: string;
  // 'pending' is retried automatically. 'failed' means the server rejected
  // the order itself (a product deactivated meanwhile, say): retrying the
  // same body can't help, so it waits for the booker to retry or discard.
  syncState: 'pending' | 'failed';
  attempts: number;
  // Epoch ms before which it is not retried (backoff). 0 = right away.
  nextAttemptAt: number;
  lastError: string | null;
};

const QUEUE_KEY = 'offline_queue';

let ownerId: number | null = null;
let queue: PendingOrder[] = [];
// Resolves once the signed-in user's stored queue is in memory. Every
// mutation waits on it: an order enqueued during app start must be added
// to the stored queue, not written over it.
let loaded: Promise<void> = Promise.resolve();
// Writes are chained so they land in the order they were made.
let writeChain: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

// Switches the queue to the user now signed in, or empties it on sign-out.
// The stored queue itself is kept either way - it belongs to that account
// and syncs the next time they sign in.
export function loadQueue(userId: number | null) {
  ownerId = userId;
  queue = [];
  emit();
  if (userId === null) {
    loaded = Promise.resolve();
    return loaded;
  }
  loaded = readJson<PendingOrder[]>(userKey(userId, QUEUE_KEY)).then((stored) => {
    if (ownerId !== userId) return;
    queue = stored ?? [];
    emit();
  });
  return loaded;
}

// Applies a change in memory at once (so the UI updates instantly) and
// persists it. Rejects if the write fails - for enqueue that means the
// order is NOT safely stored and the caller must say so.
async function mutate(change: (current: PendingOrder[]) => PendingOrder[]) {
  await loaded;
  const userId = ownerId;
  if (userId === null) throw new Error('Sign in again to save orders on this device.');

  const next = change(queue);
  queue = next;
  emit();

  const write = writeChain.then(() => writeJson(userKey(userId, QUEUE_KEY), next));
  writeChain = write.catch(() => {});
  return write;
}

export function enqueueOrder(order: PendingOrder) {
  return mutate((current) => [...current, order]);
}

export function removeFromQueue(clientRef: string) {
  return mutate((current) => current.filter((order) => order.clientRef !== clientRef));
}

export function updateQueuedOrder(clientRef: string, patch: Partial<PendingOrder>) {
  return mutate((current) =>
    current.map((order) => (order.clientRef === clientRef ? { ...order, ...patch } : order))
  );
}

export async function getQueue() {
  await loaded;
  return queue;
}

export function subscribeToQueue(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Oldest first - the order they were booked in.
export function usePendingOrders() {
  return useSyncExternalStore(subscribeToQueue, () => queue);
}
