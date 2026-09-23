import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { Banner } from '@/components/form/Banner';
import { Button } from '@/components/form/Button';
import { FormScreen } from '@/components/form/FormScreen';
import { CustomerPickerModal } from '@/components/orders/CustomerPickerModal';
import { OrderReceiptModal } from '@/components/orders/OrderReceiptModal';
import { ProductPickerModal } from '@/components/orders/ProductPickerModal';
import { PressableScale } from '@/components/PressableScale';
import { SyncStatusBar } from '@/components/SyncStatusBar';
import { PaywallModal } from '@/components/subscription/PaywallModal';
import { NetworkError } from '@/lib/api/client';
import type { Customer } from '@/lib/api/customers';
import {
  createOrder,
  getOrder,
  submitDraftOrder,
  updateDraftOrder,
  type OrderCustomer,
  type OrderDetail,
  type OrderInput,
  type OrderItem,
} from '@/lib/api/orders';
import { listProducts, type Product } from '@/lib/api/products';
import { isOnline, useIsOnline } from '@/lib/offline/network';
import { recordOrderPlaced, showInterstitialIfDue, useInterstitialPreload } from '@/lib/admobInterstitial';
import { applicableScheme, calculateLine, calculateTotals, formatScheme } from '@/lib/orderCalc';
import { onOrderSynced, queueOrder } from '@/lib/syncService';
import { useAuth } from '@/lib/auth/AuthContext';
import { usePlan } from '@/lib/plan';
import { isDailyLimitError, markLimitReached, useDailyUsage } from '@/lib/usageTracker';
import { cardShadow, colors, formatMoney, radius, spacing } from '@/lib/theme';

// Mirrors the backend's own caps so the booker is told before a request is
// wasted (the server enforces them regardless).
const MAX_ITEMS = 200;
const MAX_QUANTITY = 1000000;
const REMARKS_MAX = 1000;

// How long a new order waits on the server before it is saved on the
// device instead. Short enough that a booker on a signal that's "up" but
// moving nothing isn't left staring at a spinner; the background sync
// allows far longer.
const CREATE_TIMEOUT_MS = 20_000;

// A new order saved on the device instead of the server. `reason` is
// whether the device knew it was offline or the server just didn't answer.
type SavedOffline = {
  clientRef: string;
  status: 'draft' | 'submitted';
  reason: 'offline' | 'unreachable';
  customerName: string;
  itemCount: number;
  total: number;
};

// Quantities and discounts live in state as strings so a box can be empty
// mid-edit instead of snapping back to a number the booker didn't type.
function parseQty(value: string): number | null {
  if (value.trim() === '') return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

function parseDiscount(value: string): number | null {
  if (value.trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// True when a product's price or scheme differs from the snapshot stored on
// a saved draft line - i.e. reopening the draft has re-priced it. The
// snapshot holds the one tier that served the line's quantity, so that is
// what the product's current tiers are compared against.
function hasRepriced(item: OrderItem, product: Product) {
  const tier = applicableScheme(product, item.paidQty);
  return (
    product.salePrice !== item.rate ||
    (tier ? tier.purchaseQty : null) !== item.schemePurchaseQty ||
    (tier ? tier.bonusQty : null) !== item.schemeBonusQty
  );
}

type Line = { product: Product; quantity: string; discount: string };
type SelectedCustomer = Pick<Customer | OrderCustomer, 'id' | 'name' | 'code' | 'phone' | 'cityArea' | 'address'>;

// The core screen of the whole application: pick a customer, search
// products, enter quantities, share. The mobile counterpart of the web's
// CreateOrder page - same validation, same payload, same two routes: a new
// order, or continuing a saved draft when `draftId` is given.
//
// "Share Order" is the submit action: it books the order (assigning its
// number) and then opens the invoice to share as a JPG or PDF. A booker's
// last step is handing the customer their receipt, so the two are one tap.
//
// Every figure shown is a live preview from orderCalc. The server
// recalculates all of it on save and returns the authoritative result.
//
// A NEW order still saves with no connection: it goes to the offline queue
// (lib/syncService) and is sent when the device is back online. Editing a
// saved draft needs the server, since the draft lives there.
// `reorderFrom` starts a NEW order from a previous one (PROJECT_SPEC.md §4
// "Re-order"): same customer and quantities, today's prices, discounts and
// schemes. The previous order itself is never touched.
export function CreateOrderScreen({ draftId, reorderFrom }: { draftId?: string; reorderFrom?: string }) {
  const isEditing = Boolean(draftId);
  const reorderId = isEditing ? undefined : reorderFrom;
  // The order the form is filled from, if any: the draft being edited or
  // the order being repeated.
  const sourceId = draftId ?? reorderId;
  const online = useIsOnline();
  // Loads the every-5th-order interstitial in the background now, so it's
  // ready by the time a qualifying order's receipt is closed.
  useInterstitialPreload();
  // The Free plan's daily cap on new orders. Checked here so the booker
  // meets the paywall before filling in an order that can't be saved; the
  // server enforces it regardless (and its 402 opens the same paywall).
  const { user } = useAuth();
  const { isPro } = usePlan();
  const usage = useDailyUsage(user?.id ?? null, isPro);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [remarks, setRemarks] = useState('');

  const [saving, setSaving] = useState<null | 'draft' | 'submitted'>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState<OrderDetail | null>(null);
  // The order whose receipt is open for sharing - set as soon as a new
  // order is submitted, and again from the success banner's Share button.
  const [shareOrder, setShareOrder] = useState<OrderDetail | null>(null);
  const [savedOffline, setSavedOffline] = useState<SavedOffline | null>(null);
  // The success banner is showing an order that was queued and has since
  // synced - its invoice hasn't been shared yet, so "again" would be wrong.
  const [syncedFromOffline, setSyncedFromOffline] = useState(false);

  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  // Loading an existing draft (edit mode only).
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>(sourceId ? 'loading' : 'ready');
  // The order number being repeated, for the banner.
  const [reorderedNumber, setReorderedNumber] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notDraft, setNotDraft] = useState<OrderDetail | null>(null);
  const [repricedProducts, setRepricedProducts] = useState<string[]>([]);
  const [unavailableProducts, setUnavailableProducts] = useState<string[]>([]);

  const loadDraft = useCallback(async () => {
    if (!sourceId) return;
    setLoadStatus('loading');
    setLoadError(null);
    setNotDraft(null);
    try {
      const { order } = await getOrder(sourceId);

      // Submitted orders are not editable.
      if (!reorderId && order.status !== 'draft') {
        setNotDraft(order);
        setLoadStatus('ready');
        return;
      }

      const productIds = order.items.map((item) => item.productId);
      const products = productIds.length > 0 ? (await listProducts({ ids: productIds })).products : [];
      const productsById = new Map(products.map((product) => [product.id, product]));

      const nextLines: Line[] = [];
      const repriced: string[] = [];
      const unavailable: string[] = [];

      for (const item of order.items) {
        const product = productsById.get(item.productId);
        // A product deactivated since the draft was saved can't be ordered
        // any more, so the line is dropped and called out.
        if (!product || !product.isActive) {
          unavailable.push(item.productName);
          continue;
        }
        if (reorderId) {
          // A re-order is a new order at today's terms: the product's current
          // discount, not the one the old order was placed at.
          nextLines.push({ product, quantity: String(item.paidQty), discount: String(product.discount) });
          continue;
        }
        if (hasRepriced(item, product)) repriced.push(product.name);
        // The SAVED discount is kept, not reset to the product's current one.
        nextLines.push({ product, quantity: String(item.paidQty), discount: String(item.discount) });
      }

      setCustomer(order.customer ?? null);
      setLines(nextLines);
      // A re-order's remarks start empty - they were about the old delivery.
      setRemarks(reorderId ? '' : (order.remarks ?? ''));
      setReorderedNumber(reorderId ? order.orderNumber : null);
      setRepricedProducts(repriced);
      setUnavailableProducts(unavailable);
      setLoadStatus('ready');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoadStatus('error');
    }
  }, [sourceId, reorderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDraft();
  }, [loadDraft]);

  // The order just saved offline reached the server while this screen is
  // still open: swap the local placeholder for the real order, number and
  // all, so its invoice can be shared from here.
  useEffect(() => {
    if (!savedOffline) return;
    return onOrderSynced((clientRef, order) => {
      if (clientRef !== savedOffline.clientRef) return;
      setSavedOffline(null);
      setSuccess(order);
      setSyncedFromOffline(true);
    });
  }, [savedOffline]);

  const cartQuantities = useMemo(
    () => new Map(lines.map((line) => [line.product.id, parseQty(line.quantity) ?? 0])),
    [lines]
  );

  const calculatedLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        calc: calculateLine(line.product, parseQty(line.quantity) ?? 0, {
          discount: parseDiscount(line.discount) ?? 0,
        }),
      })),
    [lines]
  );

  const totals = useMemo(() => calculateTotals(calculatedLines.map((line) => line.calc)), [calculatedLines]);

  const isBusy = saving !== null;

  function addProduct(product: Product) {
    setSuccess(null);
    setValidationError(null);
    setLines((current) => {
      const existingIndex = current.findIndex((line) => line.product.id === product.id);
      // Adding a product that's already on the order bumps its quantity
      // rather than creating a second line.
      if (existingIndex >= 0) {
        return current.map((line, index) =>
          index === existingIndex
            ? { ...line, quantity: String(Math.min((parseQty(line.quantity) ?? 0) + 1, MAX_QUANTITY)) }
            : line
        );
      }
      if (current.length >= MAX_ITEMS) return current;
      // Newest first: the line just added is the one the booker is about
      // to look at, so it goes to the top rather than below everything.
      return [{ product, quantity: '1', discount: String(product.discount) }, ...current];
    });
  }

  // The picker's quantity stepper: sets the figure outright. Zero takes the
  // line off the order, the way the trash icon on the order screen does.
  function setProductQuantity(product: Product, quantity: number) {
    setSuccess(null);
    setValidationError(null);
    setLines((current) => {
      const existingIndex = current.findIndex((line) => line.product.id === product.id);
      if (quantity <= 0) return current.filter((line) => line.product.id !== product.id);
      const clamped = String(Math.min(quantity, MAX_QUANTITY));
      if (existingIndex >= 0) {
        return current.map((line, index) => (index === existingIndex ? { ...line, quantity: clamped } : line));
      }
      if (current.length >= MAX_ITEMS) return current;
      return [{ product, quantity: clamped, discount: String(product.discount) }, ...current];
    });
  }

  function updateLine(productId: string, patch: Partial<Pick<Line, 'quantity' | 'discount'>>) {
    setValidationError(null);
    setLines((current) => current.map((line) => (line.product.id === productId ? { ...line, ...patch } : line)));
  }

  function stepQuantity(productId: string, delta: number) {
    setValidationError(null);
    setLines((current) =>
      current.map((line) => {
        if (line.product.id !== productId) return line;
        const next = Math.min(Math.max((parseQty(line.quantity) ?? 0) + delta, 1), MAX_QUANTITY);
        return { ...line, quantity: String(next) };
      })
    );
  }

  function removeLine(productId: string) {
    setValidationError(null);
    setLines((current) => current.filter((line) => line.product.id !== productId));
  }

  function resetForm() {
    setCustomer(null);
    setLines([]);
    setRemarks('');
    setValidationError(null);
    setError(null);
    setReorderedNumber(null);
  }

  function confirmClear() {
    Alert.alert(
      'Clear this order?',
      'The selected customer, all added products and the remarks will be discarded.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Clear Order', style: 'destructive', onPress: resetForm },
      ]
    );
  }

  // Mirrors the API's rules so problems are caught before a round trip.
  function validate(status: 'draft' | 'submitted'): string | null {
    if (!customer) return 'Select a customer before saving this order.';
    if (status === 'submitted' && lines.length === 0) return 'Add at least one product before submitting the order.';

    for (const line of lines) {
      const qty = parseQty(line.quantity);
      if (qty === null) return `Enter a whole-number quantity for ${line.product.name}.`;
      if (qty <= 0) return `Quantity for ${line.product.name} must be greater than 0.`;
      if (qty > MAX_QUANTITY) {
        return `Quantity for ${line.product.name} must be at most ${MAX_QUANTITY.toLocaleString()}.`;
      }
      const discount = parseDiscount(line.discount);
      if (discount === null) return `Enter a discount for ${line.product.name}, or 0 for none.`;
      if (discount < 0 || discount > 100) return `Discount for ${line.product.name} must be between 0 and 100.`;
    }

    if (remarks.trim().length > REMARKS_MAX) return `Remarks must be at most ${REMARKS_MAX} characters.`;
    return null;
  }

  // Puts a new order in the offline queue and clears the form, exactly as a
  // successful save would. Throws if the device couldn't store it - the
  // form is then left as it was, so nothing the booker entered is lost.
  async function saveOffline(
    clientRef: string,
    status: 'draft' | 'submitted',
    payload: OrderInput,
    reason: SavedOffline['reason']
  ) {
    await queueOrder({
      clientRef,
      status,
      input: payload,
      customer: { id: customer!.id, name: customer!.name, code: customer!.code },
      itemCount: lines.length,
      total: totals.total,
      createdAt: new Date().toISOString(),
    });
    setSavedOffline({ clientRef, status, reason, customerName: customer!.name, itemCount: lines.length, total: totals.total });
    resetForm();
    usage.record();
    // Counts towards the every-5th-order ad, but can't earn one: there's no
    // receipt to close until it syncs.
    if (status === 'submitted') recordOrderPlaced(null);
  }

  async function save(status: 'draft' | 'submitted') {
    setError(null);
    setSuccess(null);
    setSavedOffline(null);
    setSyncedFromOffline(false);

    const problem = validate(status);
    if (problem) {
      setValidationError(problem);
      return;
    }
    setValidationError(null);

    // Only NEW orders count: saving or submitting an existing draft
    // creates nothing.
    if (!isEditing && usage.limitReached) {
      setPaywallOpen(true);
      return;
    }

    // Exactly the web payload: customer, remarks, and per line the product,
    // quantity and discount. Everything else is the server's to decide.
    const payload = {
      customerId: customer!.id,
      remarks: remarks.trim() || null,
      items: lines.map((line) => ({
        productId: line.product.id,
        quantity: parseQty(line.quantity) as number,
        discount: parseDiscount(line.discount),
      })),
    };

    setSaving(status);
    try {
      if (!isEditing) {
        // Generated once per save and kept with the order from here on: if
        // the attempt below times out after the server has already saved
        // it, the queued retry carries the same key and the server returns
        // that order instead of booking a second one.
        const clientRef = randomUUID();

        if (!isOnline()) {
          await saveOffline(clientRef, status, payload, 'offline');
          return;
        }

        let data;
        try {
          data = await createOrder({ ...payload, status, clientRef }, { timeoutMs: CREATE_TIMEOUT_MS });
        } catch (err) {
          // No answer from the server (not a refusal - those are shown as
          // errors below): hand the order to the queue rather than lose it.
          if (!(err instanceof NetworkError)) throw err;
          await saveOffline(clientRef, status, payload, 'unreachable');
          return;
        }
        setSuccess(data.order);
        resetForm();
        usage.record();
        // A submitted order goes straight to the share sheet; a draft has
        // no order number yet, so there is nothing to share.
        if (status === 'submitted') {
          // Not awaited: the count is bookkeeping and must never hold up
          // the receipt.
          recordOrderPlaced(data.order.id);
          setShareOrder(data.order);
        }
        return;
      }

      // Editing: the draft's contents are always saved first, so what was on
      // screen is exactly what gets submitted.
      const updated = await updateDraftOrder(draftId!, payload);
      if (status === 'draft') {
        setSuccess(updated.order);
        setRepricedProducts([]);
        setUnavailableProducts([]);
        return;
      }

      await submitDraftOrder(draftId!);
      // A draft submitted is an order placed; its receipt is closed on the
      // details screen, which checks for the ad there.
      recordOrderPlaced(draftId!);
      // The details screen opens the share sheet on arrival, so submitting
      // a draft ends the same way as submitting a new order.
      router.replace({ pathname: '/orders/[id]', params: { id: draftId!, share: '1' } });
    } catch (err) {
      // The server counted differently (orders from another phone, say):
      // the day is used up. Nothing was saved; the form is still filled in.
      if (isDailyLimitError(err)) {
        if (user) markLimitReached(user.id);
        setPaywallOpen(true);
        return;
      }
      setError(
        isEditing && err instanceof NetworkError
          ? 'Could not reach the server. A saved draft can only be changed online - your edits are still on screen, so try again once you are connected.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong.'
      );
    } finally {
      setSaving(null);
    }
  }

  // --- Edit-mode load states -----------------------------------------
  if (sourceId && loadStatus === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>{reorderId ? 'Loading the previous order…' : 'Loading draft…'}</Text>
      </View>
    );
  }

  if (sourceId && loadStatus === 'error') {
    return (
      <ErrorState
        message={`Could not load ${reorderId ? 'the order to repeat' : 'this draft'}: ${loadError}`}
        onRetry={loadDraft}
      />
    );
  }

  if (isEditing && notDraft) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={36} color={colors.textMuted} />
        <Text style={styles.lockedTitle}>This order can no longer be edited</Text>
        <Text style={[styles.muted, styles.lockedText]}>
          Order {notDraft.orderNumber} has already been {notDraft.status}. Submitted orders are permanent - to change
          one, cancel it and create a new order.
        </Text>
        <Button title="View Order" onPress={() => router.replace(`/orders/${notDraft.id}`)} />
      </View>
    );
  }

  const hasUnsavedWork = Boolean(customer || lines.length > 0 || remarks.trim());

  // Offline, the primary action can't share anything yet - there's no order
  // number or server-priced invoice until it syncs - so it says what it does.
  const savesOffline = !isEditing && !online;

  return (
    <FormScreen>
      <SyncStatusBar />

      {!isEditing && usage.remaining !== null && usage.remaining <= 5 ? (
        <Pressable
          onPress={() => setPaywallOpen(true)}
          style={({ pressed }) => [styles.usage, usage.limitReached && styles.usageDone, pressed && { opacity: 0.8 }]}>
          <Ionicons
            name={usage.limitReached ? 'lock-closed' : 'speedometer-outline'}
            size={16}
            color={usage.limitReached ? colors.danger : colors.warning}
          />
          <Text style={styles.usageText}>
            {usage.limitReached
              ? `Daily limit reached - ${usage.limit} of ${usage.limit} free orders used today.`
              : `${usage.remaining} of ${usage.limit} free orders left today.`}
          </Text>
          <Text style={styles.usageCta}>Go Pro</Text>
        </Pressable>
      ) : null}

      {savedOffline ? (
        <Banner kind="info" onDismiss={() => setSavedOffline(null)}>
          <Text style={styles.bold}>
            {savedOffline.reason === 'offline'
              ? 'Order saved offline. Will sync when back online.'
              : "The server didn't respond, so the order was saved on this device. It will sync automatically."}
          </Text>{' '}
          {savedOffline.customerName} - {savedOffline.itemCount} item{savedOffline.itemCount === 1 ? '' : 's'}, estimated
          total {formatMoney(savedOffline.total)}.
          {savedOffline.status === 'submitted'
            ? ' Its order number and invoice are issued when it syncs - you can share it from here or from Orders then.'
            : ' It will appear in your drafts once it syncs.'}
        </Banner>
      ) : null}

      {success ? (
        <Banner kind="success" onDismiss={() => setSuccess(null)}>
          <Text style={styles.bold}>
            {isEditing ? 'Draft updated.' : success.status === 'draft' ? 'Draft saved.' : `Order ${success.orderNumber} submitted.`}
          </Text>{' '}
          {success.customer?.name} - {success.items.length} item{success.items.length === 1 ? '' : 's'}, grand total{' '}
          {formatMoney(success.total)}.
          {success.status === 'draft' ? ' It has no order number yet - one is assigned when the draft is submitted.' : ''}
        </Banner>
      ) : null}

      {success && success.status === 'submitted' ? (
        <Button
          title={syncedFromOffline ? 'Share Invoice' : 'Share Invoice Again'}
          icon="share-social-outline"
          variant="secondary"
          onPress={() => setShareOrder(success)}
          style={styles.shareAgain}
        />
      ) : null}

      {unavailableProducts.length > 0 ? (
        <Banner kind="error">
          {unavailableProducts.length === 1 ? 'A product has' : `${unavailableProducts.length} products have`} been
          deactivated since this draft was saved and {unavailableProducts.length === 1 ? 'was' : 'were'} removed from
          it: {unavailableProducts.join(', ')}. Save the draft to keep this change.
        </Banner>
      ) : null}

      {reorderedNumber && !success && !savedOffline ? (
        <Banner kind="info" onDismiss={() => setReorderedNumber(null)}>
          <Text style={styles.bold}>Re-ordering {reorderedNumber || 'a previous order'}.</Text> Customer and quantities are
          copied; today&apos;s prices, discounts and schemes apply. The original order is not changed.
        </Banner>
      ) : null}

      {repricedProducts.length > 0 ? (
        <Banner kind="info">
          Prices or schemes have changed since this draft was saved, so it has been re-priced at today&apos;s values:{' '}
          {repricedProducts.join(', ')}. Line discounts you set are kept as they were.
        </Banner>
      ) : null}

      {error ? <Banner kind="error">{error}</Banner> : null}

      {/* ---------------- Customer ---------------- */}
      <Text style={styles.sectionTitle}>Customer</Text>
      {customer ? (
        <View style={styles.card}>
          <View style={styles.selectedCustomer}>
            <View style={styles.flex1}>
              <Text style={styles.customerName}>
                {customer.name} <Text style={styles.muted}>({customer.code})</Text>
              </Text>
              <Text style={styles.customerMeta}>
                {[customer.phone, customer.cityArea, customer.address].filter(Boolean).join(' · ') ||
                  'No contact details on file'}
              </Text>
            </View>
            <Button title="Change" variant="secondary" compact onPress={() => setCustomerPickerOpen(true)} disabled={isBusy} />
          </View>
        </View>
      ) : (
        <PressableScale style={styles.pickerButton} onPress={() => setCustomerPickerOpen(true)} disabled={isBusy}>
          <Ionicons name="person-add-outline" size={20} color={colors.primary} />
          <Text style={styles.pickerButtonText}>Select a customer</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </PressableScale>
      )}

      {/* ---------------- Order items ---------------- */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>
          Order Items{calculatedLines.length > 0 ? <Text style={styles.count}>  {calculatedLines.length}</Text> : null}
        </Text>
      </View>

      <PressableScale
        style={[styles.pickerButton, styles.addProductsButton]}
        onPress={() => setProductPickerOpen(true)}
        disabled={isBusy}>
        <Ionicons name="add-circle" size={20} color="#fff" />
        <Text style={styles.addProductsText}>Add Products</Text>
      </PressableScale>

      {calculatedLines.length === 0 ? (
        <View style={styles.emptyCart}>
          <Text style={styles.emptyTitle}>No items added yet</Text>
          <Text style={styles.muted}>Tap Add Products to search the catalogue.</Text>
        </View>
      ) : (
        calculatedLines.map(({ product, quantity, discount, calc }) => {
          const qty = parseQty(quantity);
          const qtyInvalid = qty === null || qty <= 0 || qty > MAX_QUANTITY;
          const parsedDiscount = parseDiscount(discount);
          const discountInvalid = parsedDiscount === null || parsedDiscount < 0 || parsedDiscount > 100;

          return (
            <View key={product.id} style={styles.line}>
              <View style={styles.lineHead}>
                <View style={styles.flex1}>
                  <Text style={styles.lineName}>{product.name}</Text>
                  <Text style={styles.lineMeta}>
                    {product.code} · {formatMoney(calc.rate)}
                    {product.packing ? ` · ${product.packing}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => removeLine(product.id)} disabled={isBusy} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>

              <View style={styles.lineControls}>
                <View style={styles.stepper}>
                  <Pressable
                    style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
                    disabled={isBusy || (qty ?? 0) <= 1}
                    onPress={() => stepQuantity(product.id, -1)}>
                    <Ionicons name="remove" size={20} color={(qty ?? 0) <= 1 ? colors.textMuted : colors.text} />
                  </Pressable>
                  <TextInput
                    style={[styles.qtyInput, qtyInvalid && styles.inputInvalid]}
                    value={quantity}
                    editable={!isBusy}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    onChangeText={(text) => updateLine(product.id, { quantity: text })}
                  />
                  <Pressable
                    style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
                    disabled={isBusy}
                    onPress={() => stepQuantity(product.id, 1)}>
                    <Ionicons name="add" size={20} color={colors.text} />
                  </Pressable>
                </View>

                <View style={styles.discountField}>
                  <Text style={styles.muted}>Disc</Text>
                  <TextInput
                    style={[styles.discountInput, discountInvalid && styles.inputInvalid]}
                    value={discount}
                    editable={!isBusy}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    onChangeText={(text) => updateLine(product.id, { discount: text })}
                  />
                  <Text style={styles.muted}>%</Text>
                </View>
              </View>

              <View style={styles.lineFoot}>
                {calc.bonusQty > 0 ? (
                  <Text style={styles.bonusBadge}>+{calc.bonusQty} Bonus Free</Text>
                ) : product.bonusSchemes.length > 0 ? (
                  <Text style={styles.muted} numberOfLines={1}>
                    {formatScheme(product)} scheme
                  </Text>
                ) : (
                  <View />
                )}
                <Text style={styles.lineTotal}>{formatMoney(calc.lineTotal)}</Text>
              </View>
            </View>
          );
        })
      )}

      {/* ---------------- Summary ---------------- */}
      <Text style={styles.sectionTitle}>Summary</Text>
      <View style={styles.card}>
        <SummaryRow label="Items" value={String(totals.totalItems)} />
        <SummaryRow label="Paid Qty" value={String(totals.totalPaidQty)} />
        <SummaryRow label="Bonus Qty" value={totals.totalBonusQty > 0 ? `+${totals.totalBonusQty}` : '0'} highlight={totals.totalBonusQty > 0} />
        <SummaryRow label="Subtotal" value={formatMoney(totals.subtotal)} />
        <SummaryRow label="Discount" value={totals.discountTotal > 0 ? `− ${formatMoney(totals.discountTotal)}` : formatMoney(0)} />
        <View style={styles.grandTotal}>
          <Text style={styles.grandTotalLabel}>Grand Total</Text>
          <Text style={styles.grandTotalValue}>{formatMoney(totals.total)}</Text>
        </View>

        <Text style={styles.remarksLabel}>Remarks</Text>
        <TextInput
          style={styles.remarks}
          value={remarks}
          onChangeText={setRemarks}
          maxLength={REMARKS_MAX}
          editable={!isBusy}
          multiline
          placeholder="Optional note for this order…"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {validationError ? <Banner kind="error">{validationError}</Banner> : null}

      <View style={styles.actions}>
        <Button
          title={saving === 'draft' ? 'Saving…' : isEditing ? 'Save Draft' : 'Save as Draft'}
          variant="secondary"
          onPress={() => save('draft')}
          loading={saving === 'draft'}
          disabled={isBusy}
          style={styles.flex1}
        />
        <Button
          title={savesOffline ? 'Save Order Offline' : 'Share Order'}
          icon={savesOffline ? 'cloud-offline-outline' : 'share-social-outline'}
          onPress={() => save('submitted')}
          loading={saving === 'submitted'}
          disabled={isBusy}
          style={styles.flex1}
        />
      </View>

      {!isEditing && hasUnsavedWork ? (
        <Button title="Clear Order" variant="danger" onPress={confirmClear} disabled={isBusy} style={styles.clear} />
      ) : null}

      <Text style={styles.note}>
        Share Order submits the order, assigns its order number and opens the invoice to share as a JPG or PDF - on
        WhatsApp or any other app. Submitting is final: a submitted order cannot be edited, only cancelled. Bonus
        quantity is free - added on top of the paid quantity, never taken out of it.
        {isEditing
          ? ''
          : ' With no connection, the order is saved on this device and sent automatically once you are back online; the server confirms its prices then.'}
      </Text>

      <CustomerPickerModal
        visible={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
        onSelect={(picked) => {
          setSuccess(null);
          setValidationError(null);
          setCustomer(picked);
        }}
      />
      <ProductPickerModal
        visible={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onAdd={addProduct}
        onSetQuantity={setProductQuantity}
        cartQuantities={cartQuantities}
        limitReached={lines.length >= MAX_ITEMS}
      />
      <OrderReceiptModal
        visible={shareOrder !== null}
        order={shareOrder}
        onClose={() => {
          const closedOrderId = shareOrder?.id;
          setShareOrder(null);
          // Shows the interstitial only if this was a 5th/10th/... order.
          showInterstitialIfDue(closedOrderId);
        }}
      />
      <PaywallModal visible={paywallOpen} reason="order_limit" onClose={() => setPaywallOpen(false)} />
    </FormScreen>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, highlight && styles.summaryHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  usage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  usageDone: { backgroundColor: colors.dangerSoft },
  usageText: { flex: 1, fontSize: 13, color: colors.text },
  usageCta: { fontSize: 13, fontWeight: '800', color: colors.primary },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  muted: { color: colors.textMuted, fontSize: 13 },
  bold: { fontWeight: '700' },
  lockedTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  lockedText: { textAlign: 'center', marginBottom: spacing.md },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md, marginTop: spacing.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { color: colors.primary, fontSize: 14 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  selectedCustomer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  customerName: { fontSize: 15, fontWeight: '700', color: colors.text },
  customerMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  pickerButtonText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  addProductsButton: { backgroundColor: colors.primary, borderColor: colors.primary, justifyContent: 'center' },
  addProductsText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  emptyCart: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: colors.text },

  line: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md + 2,
    marginBottom: spacing.sm + 2,
    ...cardShadow,
  },
  lineHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  lineName: { fontSize: 14, fontWeight: '700', color: colors.text },
  lineMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  lineControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  stepButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  stepButtonPressed: { backgroundColor: colors.border },
  qtyInput: {
    width: 64,
    height: 40,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: 0,
  },
  discountField: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  discountInput: {
    width: 64,
    height: 40,
    textAlign: 'center',
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 0,
  },
  inputInvalid: { borderColor: colors.danger, color: colors.danger },
  lineFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  bonusBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  lineTotal: { fontSize: 15, fontWeight: '700', color: colors.text },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { color: colors.textMuted, fontSize: 14 },
  summaryValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  summaryHighlight: { color: colors.success },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  grandTotalLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  grandTotalValue: { fontSize: 22, fontWeight: '700', color: colors.primary },
  remarksLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.lg, marginBottom: 6 },
  remarks: {
    minHeight: 70,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },

  actions: { flexDirection: 'row', gap: spacing.md },
  clear: { marginTop: spacing.md },
  shareAgain: { marginBottom: spacing.lg },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginTop: spacing.lg },
});
