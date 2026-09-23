import { useCallback, useEffect, useState } from 'react';

import { listOrders } from './api/orders';

// How many pages of drafts to add up before giving in. 5 x 100 is far more
// unsubmitted orders than a booker ever has open at once; the cap exists so
// a runaway account can't turn a list screen into a dozen requests.
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export type PendingTotals = {
  /** Customer id -> value of that customer's unsubmitted orders. */
  byCustomer: Map<string, number>;
  isLoading: boolean;
  reload: () => void;
};

// What each customer currently has open with the booker: the value of their
// orders that are saved but not yet submitted.
//
// This is NOT a receivables ledger - the backend has no payments table, so
// nothing in this app knows what a customer has actually paid. What it does
// know is which orders are still sitting in draft, and that is the figure
// the Customers tab shows: business promised but not yet booked.
//
// It is one extra request for the whole list rather than one per customer:
// drafts are few and the orders endpoint already filters by status.
export function usePendingOrderTotals(): PendingTotals {
  const [byCustomer, setByCustomer] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const totals = new Map<string, number>();
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const { orders, pagination } = await listOrders({ page, limit: PAGE_SIZE, status: 'draft' });
        for (const order of orders) {
          totals.set(order.customerId, (totals.get(order.customerId) ?? 0) + order.total);
        }
        if (page >= pagination.totalPages) break;
      }
      setByCustomer(totals);
    } catch {
      // A figure that couldn't be fetched is shown as "no pending orders"
      // rather than as an error screen: the customer list itself is fine,
      // and the badge is supporting detail, not the point of the screen.
      setByCustomer(new Map());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { byCustomer, isLoading, reload: load };
}
