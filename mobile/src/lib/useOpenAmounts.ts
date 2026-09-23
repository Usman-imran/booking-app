import { useCallback, useEffect, useMemo, useState } from 'react';

import { listOrders } from './api/orders';
import { usePendingOrders } from './offline/offlineQueue';
import { isOnline } from './offline/network';

// Drafts are few by nature - they are orders a booker started and has not
// finished - so one pass of a few large pages covers every account. The cap
// stops a runaway one from turning a list screen into a dozen requests.
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

// What each shop currently has open with the booker: the value of orders
// that have been started but not yet submitted, whether they are sitting on
// the server as drafts or still on this device waiting to sync.
//
// This is NOT a receivables ledger. The backend has no payments table, so
// nothing in this app knows what a shop has actually paid; a badge claiming
// otherwise would be inventing the figure. What it can say truthfully is
// how much business with that shop is still open, which is the number a
// booker standing in the shop wants.
export function useOpenAmounts() {
  const [fromServer, setFromServer] = useState<Map<string, number>>(new Map());
  // Queued orders are open by definition - they are not on the server yet.
  const pending = usePendingOrders();

  const load = useCallback(async () => {
    if (!isOnline()) return;
    try {
      const totals = new Map<string, number>();
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const { orders, pagination } = await listOrders({ page, limit: PAGE_SIZE, status: 'draft' });
        for (const order of orders) {
          totals.set(order.customerId, (totals.get(order.customerId) ?? 0) + order.total);
        }
        if (page >= pagination.totalPages) break;
      }
      setFromServer(totals);
    } catch {
      // The badge is supporting detail, not the point of the screen: a
      // figure that could not be fetched reads as "nothing open" rather
      // than replacing the customer list with an error.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const byCustomer = useMemo(() => {
    const totals = new Map(fromServer);
    for (const order of pending) {
      totals.set(order.customer.id, (totals.get(order.customer.id) ?? 0) + order.total);
    }
    return totals;
  }, [fromServer, pending]);

  return { byCustomer, reload: load };
}
