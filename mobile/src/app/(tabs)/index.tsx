import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PressableScale } from '@/components/PressableScale';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { OrderReceiptModal } from '@/components/orders/OrderReceiptModal';
import { getDashboard, type DashboardData } from '@/lib/api/dashboard';
import { useAuth } from '@/lib/auth/AuthContext';
import { useIsOnline } from '@/lib/offline/network';
import { readDashboard, saveDashboard, withOfflineFallback } from '@/lib/offline/offlineCache';
import { usePendingOrders, type PendingOrder } from '@/lib/offline/offlineQueue';
import { pendingRow, showPendingOrder } from '@/lib/offline/pendingOrderView';
import { flushQueue, useIsSyncing } from '@/lib/syncService';
import { cardShadow, colors, formatCompactMoney, formatDateTime, formatMoney, radius, spacing } from '@/lib/theme';
import { useRevalidateOnFocus } from '@/lib/usePaginatedList';

type IconName = keyof typeof Ionicons.glyphMap;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Queued orders shown above the server's recent ones; the rest are on the
// Orders tab.
const MAX_QUEUED_IN_FEED = 3;

// The header's deep navy-to-brand sweep: the receipt's navy (so the app and
// the invoices it sends read as one brand) into the app's primary blue.
const HERO_GRADIENT = 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 58%, #208AEF 100%)';

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

// --- Header -----------------------------------------------------------------

// Online/offline and the offline queue, as one pill in the header. Tapping
// it syncs what's waiting, or opens Orders when something failed.
function SyncPill() {
  const online = useIsOnline();
  const syncing = useIsSyncing();
  const pending = usePendingOrders();
  const failed = pending.filter((order) => order.syncState === 'failed').length;
  const waiting = pending.length - failed;

  let dot: string = '#4ADE80';
  let label = 'Online';
  let onPress: (() => void) | undefined;
  if (!online) {
    dot = '#FBBF24';
    label = waiting > 0 ? `Offline · ${waiting} queued` : 'Offline';
  } else if (syncing && waiting > 0) {
    dot = '#60A5FA';
    label = `Syncing ${waiting}`;
  } else if (failed > 0) {
    dot = '#F87171';
    label = `${failed} failed`;
    onPress = () => router.push('/(tabs)/orders');
  } else if (waiting > 0) {
    dot = '#60A5FA';
    label = `${waiting} to sync`;
    onPress = () => flushQueue({ ignoreBackoff: true });
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.syncPill, pressed && { opacity: 0.75 }]}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`Sync status: ${label}`}>
      {syncing && online && waiting > 0 ? (
        <ActivityIndicator size="small" color="#fff" style={styles.syncSpinner} />
      ) : (
        <View style={[styles.syncDot, { backgroundColor: dot }]} />
      )}
      <Text style={styles.syncText}>{label}</Text>
    </Pressable>
  );
}

// --- Metrics ----------------------------------------------------------------

type Tint = { fg: string; bg: string };

function MetricCard({
  icon,
  tint,
  label,
  value,
  unit,
  caption,
  onPress,
}: {
  icon: IconName;
  tint: Tint;
  label: string;
  value: string;
  unit?: string;
  caption: string;
  onPress?: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.metric,
        // A wash of the card's accent fading into white from the top-left.
        { experimental_backgroundImage: `linear-gradient(145deg, ${tint.bg} 0%, #FFFFFF 62%)` },
      ]}>
      <View style={styles.metricTop}>
        <View style={[styles.metricIcon, { backgroundColor: tint.bg }]}>
          <Ionicons name={icon} size={16} color={tint.fg} />
        </View>
        {onPress ? <Ionicons name="arrow-forward" size={14} color={colors.textMuted} /> : null}
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
        <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
      <Text style={styles.metricCaption} numberOfLines={1}>
        {caption}
      </Text>
    </PressableScale>
  );
}

// --- Quick actions ------------------------------------------------------------

function QuickAction({
  icon,
  label,
  tint,
  primary,
  onPress,
}: {
  icon: IconName;
  label: string;
  tint: Tint;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale style={styles.action} onPress={onPress} accessibilityLabel={label}>
      <View
        style={[
          styles.actionIcon,
          primary
            ? { backgroundColor: colors.primary, experimental_backgroundImage: 'linear-gradient(135deg, #3B9BF5 0%, #1668B8 100%)' }
            : { backgroundColor: tint.bg },
        ]}>
        <Ionicons name={icon} size={22} color={primary ? '#fff' : tint.fg} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}

// --- Monthly target -----------------------------------------------------------

function TargetCard({ data }: { data: DashboardData }) {
  const { target } = data;
  const month = MONTHS[data.month - 1];

  if (target.status === 'no-target') {
    return (
      <PressableScale style={[styles.card, styles.targetEmpty]} onPress={() => router.push('/targets')}>
        <View style={[styles.metricIcon, { backgroundColor: colors.accent.purple.bg }]}>
          <Ionicons name="flag-outline" size={16} color={colors.accent.purple.fg} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.targetTitle}>No target for {month}</Text>
          <Text style={styles.targetMeta}>Set one to track your progress here.</Text>
        </View>
        <Text style={styles.link}>Set target</Text>
      </PressableScale>
    );
  }

  const percent = Math.max(0, target.achievementPercent);
  const achieved = target.status === 'achieved';
  const fill = Math.min(percent, 100);

  return (
    <PressableScale style={styles.card} onPress={() => router.push('/targets')}>
      <View style={styles.targetHead}>
        <View>
          <Text style={styles.eyebrow}>{month} target</Text>
          <View style={styles.targetPercentRow}>
            <Text style={styles.targetPercent}>{Math.round(percent)}</Text>
            <Text style={styles.targetPercentSign}>%</Text>
          </View>
        </View>
        <View style={[styles.chip, achieved ? styles.chipSuccess : styles.chipInfo]}>
          <Ionicons
            name={achieved ? 'checkmark-circle' : 'trending-up'}
            size={13}
            color={achieved ? colors.success : colors.primaryDark}
          />
          <Text style={[styles.chipText, { color: achieved ? colors.success : colors.primaryDark }]}>
            {achieved ? 'Achieved' : 'In progress'}
          </Text>
        </View>
      </View>

      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fill) }}>
        <View
          style={[
            styles.trackFill,
            { width: `${fill}%` },
            {
              experimental_backgroundImage: achieved
                ? 'linear-gradient(90deg, #34D399 0%, #1E8E5A 100%)'
                : 'linear-gradient(90deg, #60A5FA 0%, #1668B8 100%)',
            },
            achieved && { backgroundColor: colors.success },
          ]}
        />
      </View>

      <View style={styles.targetFoot}>
        <Text style={styles.targetMeta}>
          <Text style={styles.targetStrong}>Rs {formatMoney(target.achieved)}</Text> of Rs {formatMoney(target.targetAmount)}
        </Text>
        <Text style={styles.targetMeta}>
          {achieved ? `+Rs ${formatCompactMoney(target.achieved - target.targetAmount)} over` : `Rs ${formatCompactMoney(target.remaining)} to go`}
        </Text>
      </View>
    </PressableScale>
  );
}

// --- Recent orders feed ---------------------------------------------------------

type FeedItem =
  | { kind: 'queued'; key: string; order: PendingOrder }
  | { kind: 'server'; key: string; order: DashboardData['recentOrders'][number] };

const STATUS_ICON: Record<string, { icon: IconName; fg: string; bg: string }> = {
  submitted: { icon: 'checkmark', fg: colors.success, bg: colors.successSoft },
  cancelled: { icon: 'close', fg: colors.danger, bg: colors.dangerSoft },
  pending_sync: { icon: 'cloud-upload-outline', fg: colors.primaryDark, bg: colors.primarySoft },
  sync_failed: { icon: 'alert', fg: colors.danger, bg: colors.dangerSoft },
};

function FeedRow({ item, onQuickView }: { item: FeedItem; onQuickView: (orderId: string) => void }) {
  const row =
    item.kind === 'queued'
      ? pendingRow(item.order)
      : { ...item.order, id: String(item.order.id), createdAt: undefined as string | undefined };
  const look = STATUS_ICON[row.status] ?? STATUS_ICON.submitted;
  const canQuickView = item.kind === 'server' && row.status === 'submitted';
  const when = formatDateTime(row.submittedAt ?? row.createdAt ?? null);

  return (
    <PressableScale
      style={styles.feedRow}
      onPress={() => (item.kind === 'queued' ? showPendingOrder(item.order) : router.push(`/orders/${row.id}`))}>
      <View style={[styles.feedIcon, { backgroundColor: look.bg }]}>
        <Ionicons name={look.icon} size={16} color={look.fg} />
      </View>
      <View style={styles.feedMain}>
        <Text style={styles.feedCustomer} numberOfLines={1}>
          {row.customer?.name ?? '-'}
        </Text>
        <Text style={styles.feedMeta} numberOfLines={1}>
          {row.orderNumber} · {when}
        </Text>
      </View>
      <View style={styles.feedEnd}>
        <Text style={[styles.feedTotal, row.status === 'cancelled' && styles.feedTotalVoid]}>
          Rs {formatMoney(row.total)}
        </Text>
        <StatusBadge status={row.status} />
      </View>
      {canQuickView ? (
        <Pressable
          onPress={() => onQuickView(row.id)}
          hitSlop={10}
          style={({ pressed }) => [styles.quickView, pressed && { opacity: 0.6 }]}
          accessibilityLabel={`Quick view receipt for ${row.orderNumber}`}>
          <Ionicons name="receipt-outline" size={18} color={colors.primary} />
        </Pressable>
      ) : null}
    </PressableScale>
  );
}

// --- Loading skeleton -----------------------------------------------------------

function Skeleton() {
  return (
    <View>
      <View style={styles.metricGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.metric, styles.skeletonCard]}>
            <View style={[styles.skeletonBar, { width: 28, height: 28, borderRadius: 8 }]} />
            <View style={[styles.skeletonBar, { width: '55%', marginTop: spacing.md }]} />
            <View style={[styles.skeletonBar, { width: '75%', height: 20, marginTop: spacing.sm }]} />
          </View>
        ))}
      </View>
      <View style={[styles.card, styles.skeletonCard, { height: 118 }]} />
    </View>
  );
}

// --- Screen ---------------------------------------------------------------------

// Home: who's signed in and whether the phone is in sync, today's numbers,
// the everyday actions, this month's target and the latest orders. Every
// figure is the backend's (GET /api/dashboard) - nothing here recalculates
// sales. Offline, the last dashboard saved on the device is shown and
// labelled as such.
export default function Home() {
  const { user } = useAuth();
  const pending = usePendingOrders();

  const [data, setData] = useState<DashboardData | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setError(null);
    try {
      let savedAt: number | null = null;
      const result = await withOfflineFallback(getDashboard, async () => {
        const cached = await readDashboard();
        savedAt = cached?.fetchedAt ?? null;
        return cached?.data ?? null;
      });
      setData(result.data);
      setCachedAt(result.fromCache ? savedAt : null);
      setStatus('ready');
      if (!result.fromCache) saveDashboard(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus((current) => (current === 'ready' ? current : 'error'));
    }
  }, []);

  useEffect(() => {
    // fetchDashboard only sets state after its internal `await`, never
    // synchronously - the lint rule can't see across that boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboard();
  }, [fetchDashboard]);

  // Figures change whenever an order is booked on a pushed screen.
  useRevalidateOnFocus(fetchDashboard);

  async function handleRefresh() {
    setIsRefreshing(true);
    await fetchDashboard();
    setIsRefreshing(false);
  }

  const feed = useMemo<FeedItem[]>(() => {
    if (!data) return [];
    const queued = [...pending]
      .reverse()
      .slice(0, MAX_QUEUED_IN_FEED)
      .map((order) => ({ kind: 'queued' as const, key: order.clientRef, order }));
    const server = data.recentOrders.map((order) => ({ kind: 'server' as const, key: String(order.id), order }));
    return [...queued, ...server];
  }, [data, pending]);

  const firstName = user?.name?.trim().split(/\s+/)[0] || user?.username || '';
  const accent = colors.accent;

  const header = (
    <View>
      {/* Hero: identity, date and sync state on the brand gradient. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <PressableScale onPress={() => router.push('/(tabs)/profile')} hitSlop={8} accessibilityLabel="Profile">
            <Avatar name={user?.name} size={44} />
          </PressableScale>
          <SyncPill />
        </View>
        <Text style={styles.heroDate}>{todayLabel()}</Text>
        <Text style={styles.heroGreeting} numberOfLines={1}>
          {greetingForNow()}, {firstName}
        </Text>
        {user?.companyName ? (
          <Text style={styles.heroCompany} numberOfLines={1}>
            {user.companyName}
          </Text>
        ) : null}
        {cachedAt ? (
          <View style={styles.cachedNote}>
            <Ionicons name="time-outline" size={13} color="#CBD5E1" />
            <Text style={styles.cachedText}>Figures saved {formatDateTime(new Date(cachedAt).toISOString())}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        {status === 'loading' ? <Skeleton /> : null}

        {status === 'error' ? (
          <ErrorState message={`Could not load your dashboard: ${error}`} onRetry={fetchDashboard} />
        ) : null}

        {status === 'ready' && data ? (
          <>
            <View style={styles.metricGrid}>
              <MetricCard
                icon="wallet-outline"
                tint={accent.blue}
                label="SALES TODAY"
                unit="Rs"
                value={formatCompactMoney(data.today.sales)}
                caption={`Rs ${formatMoney(data.today.sales)}`}
                onPress={() => router.push('/reports')}
              />
              <MetricCard
                icon="receipt-outline"
                tint={accent.green}
                label="ORDERS TODAY"
                value={String(data.today.orders)}
                caption={`${data.monthly.orders} this month`}
                onPress={() => router.push('/(tabs)/orders')}
              />
              <MetricCard
                icon="document-text-outline"
                tint={accent.orange}
                label="DRAFTS TO FINISH"
                value={String(data.draftOrders)}
                caption="saved, not submitted"
                onPress={() => router.push('/(tabs)/orders')}
              />
              <MetricCard
                icon="calendar-outline"
                tint={accent.purple}
                label={`${MONTHS[data.month - 1].slice(0, 3).toUpperCase()} TO DATE`}
                unit="Rs"
                value={formatCompactMoney(data.monthly.sales)}
                caption={`${data.monthly.orders} valid order${data.monthly.orders === 1 ? '' : 's'}`}
                onPress={() => router.push('/analytics')}
              />
            </View>
          </>
        ) : null}

        <View style={styles.actions}>
          <QuickAction icon="add" label="New Order" tint={accent.blue} primary onPress={() => router.push('/orders/new')} />
          <QuickAction icon="person-add-outline" label="Add Customer" tint={accent.green} onPress={() => router.push('/customers/new')} />
          <QuickAction icon="cube-outline" label="Products" tint={accent.purple} onPress={() => router.push('/(tabs)/products')} />
          <QuickAction icon="bar-chart-outline" label="Reports" tint={accent.orange} onPress={() => router.push('/reports')} />
        </View>

        {status === 'ready' && data ? (
          <>
            <TargetCard data={data} />
            <SectionHeader title="Recent orders" actionLabel="See all" onAction={() => router.push('/(tabs)/orders')} />
            {feed.length === 0 ? (
              <EmptyState icon="receipt-outline" title="No orders yet" message="Orders you book will show up here." />
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        data={status === 'ready' ? feed : []}
        keyExtractor={(item) => `${item.kind}-${item.key}`}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={styles.feedItemWrap}>
            <FeedRow item={item} onQuickView={setQuickViewId} />
          </View>
        )}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      />
      <OrderReceiptModal visible={quickViewId !== null} orderId={quickViewId} onClose={() => setQuickViewId(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  flex: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: spacing.xxl },
  body: { paddingHorizontal: spacing.xl, marginTop: -spacing.xxl },

  // Hero
  hero: {
    backgroundColor: '#0F172A',
    experimental_backgroundImage: HERO_GRADIENT,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl + spacing.xl,
    borderBottomLeftRadius: radius.xl + 8,
    borderBottomRightRadius: radius.xl + 8,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  heroDate: { fontSize: 12, fontWeight: '600', color: '#93C5FD', letterSpacing: 0.4, textTransform: 'uppercase' },
  heroGreeting: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 4, letterSpacing: -0.3 },
  heroCompany: { fontSize: 13, color: '#CBD5E1', marginTop: 2 },
  cachedNote: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  cachedText: { fontSize: 12, color: '#CBD5E1' },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncSpinner: { transform: [{ scale: 0.7 }], width: 8, height: 8 },
  syncText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Metrics
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  metric: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...cardShadow,
  },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricIcon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.7, marginTop: spacing.md },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  metricUnit: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  metricValue: {
    flexShrink: 1,
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  metricCaption: { fontSize: 11.5, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },

  // Quick actions
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  action: { flex: 1, alignItems: 'center', gap: spacing.sm },
  actionIcon: { width: 50, height: 50, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center' },

  // Target
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  targetEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  targetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.7, textTransform: 'uppercase' },
  targetPercentRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  targetPercent: { fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  targetPercentSign: { fontSize: 18, fontWeight: '700', color: colors.textMuted, marginLeft: 2 },
  targetTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  targetMeta: { fontSize: 12, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  targetStrong: { color: colors.text, fontWeight: '700' },
  targetFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  trackFill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  chipInfo: { backgroundColor: colors.primarySoft },
  chipSuccess: { backgroundColor: colors.successSoft },
  chipText: { fontSize: 11, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '700', color: colors.primary },

  // Feed
  feedItemWrap: { paddingHorizontal: spacing.xl },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  feedIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  feedMain: { flex: 1, gap: 2 },
  feedCustomer: { fontSize: 14, fontWeight: '700', color: colors.text },
  feedMeta: { fontSize: 12, color: colors.textMuted },
  feedEnd: { alignItems: 'flex-end', gap: 4 },
  feedTotal: { fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  feedTotalVoid: { color: colors.textMuted, textDecorationLine: 'line-through' },
  quickView: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginLeft: 2,
  },

  // Skeleton
  skeletonCard: { backgroundColor: colors.surface },
  skeletonBar: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceMuted },
});
