import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { DateField, fromIsoDate, toIsoDate } from '@/components/form/DateField';
import { getReport, type Report, type ReportRow, type ReportType } from '@/lib/api/reports';
import { cardShadow, colors, formatMoney, radius, spacing } from '@/lib/theme';

const PAGE_SIZE = 50;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// The breakdowns, as chips. Each declares how one of its rows reads; the
// date range, summary strip, paging and states are shared. The web's
// "Date Range" tab has no counterpart here: it only showed the period's
// totals, which the summary strip already shows above every tab.
const TABS: { id: ReportType; label: string; empty: string }[] = [
  { id: 'daily', label: 'Daily', empty: 'No sales in this period.' },
  { id: 'monthly', label: 'Monthly', empty: 'No sales in this period.' },
  { id: 'customer', label: 'Customer-wise', empty: 'No customer had sales in this period.' },
  { id: 'product', label: 'Product-wise', empty: 'No product sold in this period.' },
  { id: 'company', label: 'Company-wise', empty: 'No company had sales in this period.' },
];

function todayIso() {
  return toIsoDate(new Date());
}

function monthStartIso() {
  const now = new Date();
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function yearStartIso() {
  return toIsoDate(new Date(new Date().getFullYear(), 0, 1));
}

function formatDay(iso: string) {
  return fromIsoDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function rowKey(row: ReportRow, index: number) {
  return row.customerId ?? row.productId ?? row.period ?? row.company ?? String(index);
}

function ReportRowCard({ type, row }: { type: ReportType; row: ReportRow }) {
  let title = '';
  let subtitle: string | null = null;
  if (type === 'daily') title = row.period ? formatDay(row.period) : '-';
  else if (type === 'monthly') title = `${MONTH_NAMES[(row.month ?? 1) - 1]} ${row.year}`;
  else if (type === 'customer') {
    title = row.customerName ?? '-';
    subtitle = row.customerCode ?? null;
  } else if (type === 'product') {
    title = row.productName ?? '-';
    subtitle = row.productCode ?? null;
  } else if (type === 'company') {
    title = row.company ?? 'No company recorded';
    subtitle = `${row.products ?? 0} product${row.products === 1 ? '' : 's'} · ${row.orders} order${row.orders === 1 ? '' : 's'}`;
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.rowMeta}>{subtitle}</Text> : null}
        <Text style={styles.rowMeta}>
          {type === 'product' || type === 'company'
            ? `${row.paidQty ?? 0} paid qty${row.bonusQty ? ` · +${row.bonusQty} bonus free` : ''}`
            : `${row.orders} valid order${row.orders === 1 ? '' : 's'}`}
        </Text>
      </View>
      <Text style={styles.rowSales}>{formatMoney(row.sales)}</Text>
    </View>
  );
}

// Sales Reports. Every number is computed by the backend from one shared
// definition of a valid sale - submitted orders only, bonus quantities
// worth nothing, discounts already applied - so this screen cannot drift
// from the Dashboard or Targets. Mirrors the web's SalesReports page.
export function SalesReportsScreen() {
  const [type, setType] = useState<ReportType>('daily');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [report, setReport] = useState<Report | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const id = ++requestId.current;
      setError(null);
      if (mode === 'initial') setStatus('loading');
      else setIsRefreshing(true);
      try {
        const data = await getReport({ type, dateFrom, dateTo, page: 1, limit: PAGE_SIZE });
        if (id !== requestId.current) return;
        setReport(data);
        setRows(data.rows);
        setStatus('ready');
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        setStatus('error');
      } finally {
        if (id === requestId.current) setIsRefreshing(false);
      }
    },
    [type, dateFrom, dateTo]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('initial');
  }, [load]);

  async function loadMore() {
    if (!report || isLoadingMore || status !== 'ready') return;
    if (report.pagination.page >= report.pagination.totalPages) return;
    const id = requestId.current;
    setIsLoadingMore(true);
    try {
      const data = await getReport({ type, dateFrom, dateTo, page: report.pagination.page + 1, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      setReport(data);
      setRows((current) => [...current, ...data.rows]);
    } catch {
      // Scrolling again retries; not worth replacing the report with an error.
    } finally {
      if (id === requestId.current) setIsLoadingMore(false);
    }
  }

  function applyPreset(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
  }

  const today = todayIso();
  const hasRange = Boolean(dateFrom || dateTo);
  const summary = report?.summary;
  const tab = TABS.find((item) => item.id === type)!;

  const presets: { label: string; from: string; to: string; active: boolean }[] = [
    { label: 'Today', from: today, to: today, active: dateFrom === today && dateTo === today },
    { label: 'This Month', from: monthStartIso(), to: today, active: dateFrom === monthStartIso() && dateTo === today },
    { label: 'This Year', from: yearStartIso(), to: today, active: dateFrom === yearStartIso() && dateTo === today },
    { label: 'All Time', from: '', to: '', active: !hasRange },
  ];

  const header = (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
        {TABS.map((item) => {
          const active = item.id === type;
          return (
            <Pressable
              key={item.id}
              onPress={() => setType(item.id)}
              style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.dates}>
        <DateField label="From" value={dateFrom} onChange={setDateFrom} maximumDate={dateTo ? fromIsoDate(dateTo) : undefined} />
        <DateField label="To" value={dateTo} onChange={setDateTo} minimumDate={dateFrom ? fromIsoDate(dateFrom) : undefined} />
      </View>
      <View style={styles.presets}>
        {presets.map((preset) => (
          <Pressable
            key={preset.label}
            onPress={() => applyPreset(preset.from, preset.to)}
            style={({ pressed }) => [styles.preset, preset.active && styles.presetActive, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.presetText, preset.active && styles.presetTextActive]}>{preset.label}</Text>
          </Pressable>
        ))}
      </View>

      {status !== 'error' ? (
        <>
          <View style={styles.summaryGrid}>
            <SummaryTile label="Total Sales" value={summary ? formatMoney(summary.sales) : '…'} primary />
            <SummaryTile label="Valid Orders" value={summary ? String(summary.orders) : '…'} />
            <SummaryTile label="Gross" value={summary ? formatMoney(summary.subtotal) : '…'} />
            <SummaryTile label="Discount" value={summary ? `− ${formatMoney(summary.discountTotal)}` : '…'} />
            <SummaryTile label="Paid Qty Sold" value={summary ? String(summary.paidQty) : '…'} />
            <SummaryTile label="Bonus Qty (free)" value={summary ? String(summary.bonusQty) : '…'} />
          </View>
          <Text style={styles.note}>
            {hasRange ? `Covering ${dateFrom || 'the beginning'} to ${dateTo || 'today'}.` : 'Covering all time.'} Only
            submitted orders count - drafts and cancelled orders are excluded. Bonus quantities are free and add nothing to
            sales; line discounts are already deducted.
          </Text>
        </>
      ) : null}

      {status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}
    </View>
  );

  if (status === 'error') {
    return (
      <View style={styles.flex}>
        {header}
        <ErrorState message={`Could not load this report: ${error}`} onRetry={() => load('initial')} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.listContent}
      data={status === 'ready' ? rows : []}
      keyExtractor={rowKey}
      ListHeaderComponent={header}
      renderItem={({ item }) => <ReportRowCard type={type} row={item} />}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={status === 'ready' ? <EmptyState icon="bar-chart-outline" title={tab.empty} /> : null}
      ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null}
    />
  );
}

function SummaryTile({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <View style={[styles.tile, primary && styles.tilePrimary]}>
      <Text style={[styles.tileLabel, primary && styles.onPrimaryMuted]}>{label}</Text>
      <Text style={[styles.tileValue, primary && styles.onPrimary]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: spacing.xxl * 2 },
  center: { alignItems: 'center', paddingVertical: spacing.xxl },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  dates: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  preset: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  presetActive: { backgroundColor: colors.primarySoft },
  presetText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  presetTextActive: { color: colors.primaryDark },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.xl },
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tilePrimary: { backgroundColor: colors.primary, borderColor: colors.primary, flexBasis: '100%' },
  tileLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  tileValue: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 4 },
  onPrimary: { color: '#fff', fontSize: 24 },
  onPrimaryMuted: { color: '#dceaff' },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 18, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md + 2,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    ...cardShadow,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  rowSales: { fontSize: 15, fontWeight: '700', color: colors.text },
  footer: { paddingVertical: spacing.lg },
});
