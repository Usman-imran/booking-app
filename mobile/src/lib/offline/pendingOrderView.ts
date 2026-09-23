import { Alert } from 'react-native';

import type { PendingOrder } from './offlineQueue';
import { discardQueuedOrder, retryQueuedOrder } from '../syncService';
import { formatDateTime, formatMoney } from '../theme';

// How an order still waiting in the offline queue is shown and handled,
// shared by the Orders tab and Home's recent-orders feed so it behaves the
// same wherever it appears.

// A queued order in the shape OrderRow draws. It has no order number until
// the server assigns one, so the slot says what it is instead.
export function pendingRow(order: PendingOrder) {
  return {
    id: order.clientRef,
    orderNumber: order.status === 'draft' ? 'Draft - not yet synced' : 'Order no. assigned on sync',
    status: order.syncState === 'failed' ? 'sync_failed' : 'pending_sync',
    total: order.total,
    submittedAt: null,
    createdAt: order.createdAt,
    customer: order.customer,
  };
}

// What tapping a queued order does: explain its state, and offer to sync,
// retry or discard it.
export function showPendingOrder(order: PendingOrder) {
  const summary =
    `${order.itemCount} item${order.itemCount === 1 ? '' : 's'}, estimated total ${formatMoney(order.total)}. ` +
    `Saved on this device ${formatDateTime(order.createdAt)}.\n\n`;
  const discard = {
    text: 'Discard',
    style: 'destructive' as const,
    onPress: () =>
      Alert.alert('Discard this order?', 'It has not reached the server and will be deleted from this device.', [
        { text: 'Keep', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => discardQueuedOrder(order.clientRef) },
      ]),
  };

  if (order.syncState === 'failed') {
    Alert.alert(
      `Could not sync - ${order.customer.name}`,
      `${summary}The server did not accept this order: ${order.lastError}\n\n` +
        'Retry once the problem is fixed, or discard it and book it again.',
      [{ text: 'Close', style: 'cancel' }, discard, { text: 'Retry', onPress: () => retryQueuedOrder(order.clientRef) }]
    );
    return;
  }
  Alert.alert(
    `Pending sync - ${order.customer.name}`,
    `${summary}It will be sent automatically when you are online.` +
      (order.lastError ? `\n\nLast attempt: ${order.lastError}` : ''),
    [{ text: 'Close', style: 'cancel' }, discard, { text: 'Sync now', onPress: () => retryQueuedOrder(order.clientRef) }]
  );
}
