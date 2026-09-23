import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrderRow } from '@/components/OrderRow';
import { PressableScale } from '@/components/PressableScale';
import { SectionHeader } from '@/components/SectionHeader';
import { getDashboard, type DashboardData } from '@/lib/api/dashboard';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRevalidateOnFocus } from '@/lib/usePaginatedList';
import { cardShadow, colors, formatCompactRs, formatRs, radius, spacing } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Accent = keyof typeof colors.accent;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function QuickAction({
  icon,
  label,
  accent,
  onPress,
}: {
  icon: IconName;
  label: string;
  accent: Accent;
  onPress: () => void;
}) {
  const tint = colors.accent[accent];
  return (
    <PressableScale style={styles.quickAction} onPress={onPress}>
      <View style={[styles.quickActionIcon, { backgroundColor: tint.bg }]}>
        <Ionicons name={icon} size={22} color={tint.fg} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </PressableScale>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  primary,
}: {
  icon: IconName;
  label: string;
  value: string;
  hint?: string;
  primary?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, primary && styles.summaryCardPrimary]}>
      <View style={[styles.summaryIcon, primary && styles.summaryIconPrimary]}>
        <Ionicons name={icon} size={18} color={primary ? '#fff' : colors.primary} />
      </View>
      <Text style={[styles.summaryLabel, primary && styles.onPrimaryMuted]}>{label}</Text>
      <Text style={[styles.summaryValue, primary && styles.onPrimary]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={[styles.summaryHint, primary && styles.onPrimaryMuted]}>{hint}</Text> : null}
    </View>
  );
}

// The mobile counterpart of the web Dashboard - same endpoint, same
// pre-computed figures. Nothing here recalculates sales; see
// GET /api/dashboard on the backend for why that matters.
export default function Dashboard() {
  const { user } = useAuth();

  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setError(null);
    try {
      const result = await getDashboard();
      setData(result);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
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

  const monthShort = data ? MONTHS_SHORT[data.month - 1] : '';
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        data={status === 'ready' && data ? data.recentOrders : []}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.greeting}>{greetingForNow()},</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {firstName || user?.username} 👋
                </Text>
                {user?.companyName ? (
                  <Text style={styles.company} numberOfLines={1}>
                    {user.companyName}
                  </Text>
                ) : null}
              </View>
              <PressableScale onPress={() => router.push('/(tabs)/profile')} hitSlop={8}>
                <Avatar name={user?.name} size={48} />
              </PressableScale>
            </View>

            <SectionHeader title="Quick Actions" />
            <View style={styles.quickActions}>
              <QuickAction icon="add-circle" label="New Order" accent="blue" onPress={() => router.push('/orders/new')} />
              <QuickAction icon="person-add" label="Add Customer" accent="green" onPress={() => router.push('/customers/new')} />
              <QuickAction icon="cube" label="Add Product" accent="purple" onPress={() => router.push('/products/new')} />
              <QuickAction
                icon="cloud-upload"
                label="Import Products"
                accent="orange"
                onPress={() => router.push('/products/import')}
              />
              <QuickAction icon="bar-chart" label="Sales Reports" accent="blue" onPress={() => router.push('/reports')} />
              <QuickAction icon="flag" label="Targets" accent="green" onPress={() => router.push('/targets')} />
            </View>

            {status === 'loading' && (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}

            {status === 'error' && (
              <ErrorState message={`Could not load the dashboard: ${error}`} onRetry={fetchDashboard} />
            )}

            {status === 'ready' && data ? (
              <>
                <SectionHeader title="Overview" actionLabel="Details" onAction={() => router.push('/analytics')} />
                <View style={styles.summaryGrid}>
                  <SummaryCard
                    icon="wallet"
                    label={`${monthShort} Revenue`}
                    value={formatCompactRs(data.monthly.sales)}
                    hint={formatRs(data.monthly.sales)}
                    primary
                  />
                  <SummaryCard
                    icon="receipt"
                    label={`${monthShort} Orders`}
                    value={String(data.monthly.orders)}
                    hint={`${data.today.orders} today`}
                  />
                  <SummaryCard
                    icon="today"
                    label="Today's Sales"
                    value={formatCompactRs(data.today.sales)}
                    hint={formatRs(data.today.sales)}
                  />
                  <SummaryCard
                    icon="time"
                    label="Pending Drafts"
                    value={String(data.draftOrders)}
                    hint="awaiting submission"
                  />
                </View>

                <SectionHeader
                  title="Recent Orders"
                  actionLabel="See all"
                  onAction={() => router.push('/(tabs)/orders')}
                />
                {data.recentOrders.length === 0 ? (
                  <EmptyState icon="receipt-outline" title="No orders yet" message="New orders will show up here." />
                ) : null}
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <OrderRow order={item} onPress={() => router.push(`/orders/${item.id}`)} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  listContent: { padding: spacing.xl, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerText: { flexShrink: 1, paddingRight: spacing.md },
  greeting: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  name: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 2 },
  company: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  center: { alignItems: 'center', paddingVertical: spacing.xxl },

  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  quickAction: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md + 2,
    ...cardShadow,
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: colors.text },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  summaryCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  summaryCardPrimary: { backgroundColor: colors.primary },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  summaryIconPrimary: { backgroundColor: 'rgba(255,255,255,0.2)' },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  summaryValue: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 4 },
  summaryHint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  onPrimary: { color: '#fff' },
  onPrimaryMuted: { color: '#dceaff' },
});
