import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { PressableScale } from '../PressableScale';
import { listProductCompanies, listProducts, type Product } from '@/lib/api/products';
import { cachedCompanies, searchCachedProducts, withOfflineFallback } from '@/lib/offline/offlineCache';
import { formatScheme } from '@/lib/orderCalc';
import { colors, formatMoney, radius, spacing } from '@/lib/theme';

const RESULT_LIMIT = 25;
const MAX_QUANTITY = 1000000;

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (product: Product) => void;
  // Sets a product's quantity on the order outright: 0 removes the line,
  // anything else creates or updates it.
  onSetQuantity: (product: Product, quantity: number) => void;
  // Product id -> quantity already on the order, so a row can say so.
  cartQuantities: Map<string, number>;
  limitReached: boolean;
};

// The quantity control for a product that is already on the order: minus,
// a typeable figure, plus. Typing lands on the order as soon as the figure
// is a whole number, so the booker can key "24" and move on; a box left
// blank or invalid snaps back to the real quantity when it loses focus.
function QuantityStepper({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  // While the box is being typed in it shows the keystrokes (so it can be
  // blank mid-edit); otherwise it shows the order's own figure, so a +/-
  // tap or a change made on the order screen is reflected here too.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(quantity);

  function commit(value: string) {
    setDraft(value);
    const parsed = Number(value);
    if (value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0) {
      onChange(Math.min(parsed, MAX_QUANTITY));
    }
  }

  return (
    <View style={styles.stepper}>
      <Pressable
        style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
        onPress={() => onChange(quantity - 1)}
        hitSlop={4}>
        <Ionicons name={quantity <= 1 ? 'trash-outline' : 'remove'} size={18} color={quantity <= 1 ? colors.danger : colors.text} />
      </Pressable>
      <TextInput
        style={styles.qtyInput}
        value={text}
        keyboardType="number-pad"
        selectTextOnFocus
        onFocus={() => setDraft(String(quantity))}
        onChangeText={commit}
        onBlur={() => setDraft(null)}
      />
      <Pressable
        style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
        onPress={() => onChange(Math.min(quantity + 1, MAX_QUANTITY))}
        hitSlop={4}>
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

// The mobile product browser: search, optional company filter, tap "Add".
// The sheet stays open after adding so several products (or several
// strengths of the same medicine) can be added in one go. Once a product
// is on the order its row turns into a quantity stepper, so a quantity of
// 24 is typed here rather than tapped 24 times or hunted for on the order
// screen afterwards.
//
// Offline, it searches the copy of the catalogue saved on the device.
// Prices there can be up to a sync behind; the server re-prices the order
// when it is sent.
export function ProductPickerModal({ visible, onClose, onAdd, onSetQuantity, cartQuantities, limitReached }: Props) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('');
  const [companies, setCompanies] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  // The company filter's options. A failure costs only this one filter.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    withOfflineFallback(
      () => listProductCompanies().then((data) => data.companies),
      () => cachedCompanies()
    )
      .then(({ data }) => {
        if (!cancelled) setCompanies(data);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const fetchProducts = useCallback(async () => {
    const requestId = ++requestRef.current;
    setStatus('loading');
    setError(null);
    try {
      const { data, fromCache: cached } = await withOfflineFallback(
        () =>
          listProducts({
            search: search || undefined,
            company: company || undefined,
            isActive: true,
            limit: RESULT_LIMIT,
            page: 1,
          }).then((result) => result.products),
        () => searchCachedProducts({ search, company, limit: RESULT_LIMIT })
      );
      if (requestRef.current !== requestId) return;
      setProducts(data);
      setFromCache(cached);
      setStatus('ready');
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [search, company]);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
  }, [visible, fetchProducts]);

  const hasFilters = Boolean(search || company);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Add Products</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, code or company"
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {input ? (
            <Pressable onPress={() => setInput('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {companies.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled">
            {['', ...companies].map((name) => {
              const active = name === company;
              return (
                <Pressable
                  key={name || '__all'}
                  onPress={() => setCompany(name)}
                  style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{name || 'All companies'}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {fromCache && status === 'ready' ? (
          <Text style={styles.offlineNote}>
            Offline - searching the catalogue saved on this device. Prices are confirmed when the order syncs.
          </Text>
        ) : null}

        {limitReached ? (
          <Text style={styles.limit}>An order can hold at most 200 products. Remove a line before adding another.</Text>
        ) : null}

        {status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : status === 'error' ? (
          <ErrorState message={`Could not load products: ${error}`} onRetry={fetchProducts} />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <EmptyState
                icon="cube-outline"
                title={hasFilters ? 'No active product matches this search' : 'No active products yet'}
              />
            }
            renderItem={({ item }) => {
              const inCart = cartQuantities.get(item.id) ?? 0;
              return (
                <View style={[styles.row, inCart > 0 && styles.rowInCart]}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.code}
                      {item.packing ? ` · ${item.packing}` : ''}
                      {item.unit ? ` · ${item.unit}` : ''}
                      {item.company ? ` · ${item.company}` : ''}
                    </Text>
                    <View style={styles.rowTags}>
                      <Text style={styles.price}>{formatMoney(item.salePrice)}</Text>
                      {item.discount > 0 ? <Text style={styles.tagDiscount}>{item.discount}% off</Text> : null}
                      {item.schemeEnabled ? <Text style={styles.tagScheme}>{formatScheme(item)}</Text> : null}
                      {inCart > 0 ? <Text style={styles.tagInCart}>{inCart} in order</Text> : null}
                    </View>
                  </View>
                  {inCart > 0 ? (
                    <QuantityStepper quantity={inCart} onChange={(quantity) => onSetQuantity(item, quantity)} />
                  ) : (
                    <PressableScale
                      style={[styles.addButton, limitReached && styles.addButtonDisabled]}
                      disabled={limitReached}
                      onPress={() => onAdd(item)}>
                      <Ionicons name="add" size={22} color="#fff" />
                    </PressableScale>
                  )}
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  done: { fontSize: 16, fontWeight: '600', color: colors.primary },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  limit: { color: colors.danger, fontSize: 13, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  offlineNote: { fontSize: 12, color: colors.primaryDark, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowInCart: { borderColor: colors.primary },
  rowMain: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  rowTags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
  price: { fontSize: 14, fontWeight: '700', color: colors.text },
  tagDiscount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  tagScheme: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  tagInCart: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { opacity: 0.4 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  stepButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  stepButtonPressed: { backgroundColor: colors.border },
  qtyInput: {
    width: 56,
    height: 40,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: 0,
  },
});
