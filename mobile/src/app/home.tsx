import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getDashboard, type DashboardData } from '@/lib/api/dashboard';
import { useAuth } from '@/lib/auth/AuthContext';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_LABELS: Record<string, string> = {
  achieved: 'Achieved',
  'in-progress': 'In Progress',
  'not-started': 'Not Started',
  'no-target': 'No Target Set',
};

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value ?? 0
  );
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatTile({ label, value, primary }: { label: string; value: string | number; primary?: boolean }) {
  return (
    <View style={[styles.tile, primary && styles.tilePrimary]}>
      <Text style={[styles.tileLabel, primary && styles.tileLabelPrimary]}>{label}</Text>
      <Text style={[styles.tileValue, primary && styles.tileValuePrimary]}>{value}</Text>
    </View>
  );
}

// The mobile counterpart of the web Dashboard - same endpoint, same
// pre-computed figures. Nothing here recalculates sales; see
// GET /api/dashboard on the backend for why that matters.
export default function Home() {
  const { user, isLoading: isAuthLoading, logout } = useAuth();

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
    if (user) fetchDashboard();
  }, [user, fetchDashboard]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await fetchDashboard();
    setIsRefreshing(false);
  }

  async function handleLogout() {
    await logout();
    router.replace('/sign-in');
  }

  // Direct navigation without a session - bounce to sign-in, mirroring
  // ProtectedRoute in the web frontend.
  if (!isAuthLoading && !user) {
    return <Redirect href="/sign-in" />;
  }

  const monthLabel = data ? MONTHS[data.month - 1] + ' ' + data.year : '';
  const monthShort = data ? MONTHS[data.month - 1] : '';
  const target = data?.target;

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.listContent}
      data={status === 'ready' && data ? data.recentOrders : []}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Dashboard</Text>
              {user?.companyName ? <Text style={styles.company}>{user.companyName}</Text> : null}
            </View>
            <TouchableOpacity onPress={handleLogout}>
              <Text style={styles.logout}>Sign out</Text>
            </TouchableOpacity>
          </View>

          {status === 'loading' && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#208AEF" />
            </View>
          )}

          {status === 'error' && (
            <View style={styles.center}>
              <Text style={styles.errorText}>Could not load the dashboard: {error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchDashboard}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {status === 'ready' && data && target ? (
            <>
              <View style={styles.tileGrid}>
                <StatTile label="Today's Orders" value={data.today.orders} />
                <StatTile label="Today's Sales" value={formatMoney(data.today.sales)} primary />
                <StatTile label={monthShort + ' Orders'} value={data.monthly.orders} />
                <StatTile label={monthShort + ' Sales'} value={formatMoney(data.monthly.sales)} primary />
                <StatTile label="Draft Orders" value={data.draftOrders} />
              </View>

              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>Monthly Target - {monthLabel}</Text>
                  <Text style={styles.badge}>{STATUS_LABELS[target.status] ?? target.status}</Text>
                </View>

                {target.targetAmount > 0 ? (
                  <>
                    <Text style={styles.bigNumber}>{formatMoney(target.achievementPercent)}%</Text>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${Math.min(target.achievementPercent, 100)}%` as `${number}%` },
                        ]}
                      />
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Target</Text>
                      <Text style={styles.summaryValue}>{formatMoney(target.targetAmount)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Achieved</Text>
                      <Text style={styles.summaryValue}>{formatMoney(target.achieved)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>
                        {target.remaining < 0 ? 'Exceeded By' : 'Remaining'}
                      </Text>
                      <Text style={styles.summaryValue}>{formatMoney(Math.abs(target.remaining))}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.muted}>
                    No target set for {monthLabel}. {formatMoney(target.achieved)} achieved so far.
                  </Text>
                )}
              </View>

              <Text style={styles.sectionTitle}>Recent Orders</Text>
              {data.recentOrders.length === 0 ? (
                <Text style={styles.muted}>No orders yet.</Text>
              ) : null}
            </>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.orderRow}>
          <View style={styles.orderRowMain}>
            <Text style={styles.orderNumber}>{item.orderNumber}</Text>
            <Text style={styles.orderCustomer}>{item.customer.name}</Text>
            <Text style={styles.orderDate}>{formatDateTime(item.submittedAt)}</Text>
          </View>
          <View style={styles.orderRowEnd}>
            <Text style={item.status === 'cancelled' ? styles.orderTotalVoid : styles.orderTotal}>
              {formatMoney(item.total)}
            </Text>
            <Text style={styles.orderStatus}>{item.status}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  listContent: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greeting: { fontSize: 24, fontWeight: '700', color: '#1a2233' },
  company: { fontSize: 13, color: '#5b6472', marginTop: 2 },
  logout: { color: '#b3261e', fontSize: 14, fontWeight: '600' },
  center: { alignItems: 'center', paddingVertical: 24 },
  errorText: { color: '#b3261e', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryButton: { backgroundColor: '#eef1f5', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  retryButtonText: { color: '#1a2233', fontWeight: '600' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#f4f6f9',
    borderRadius: 12,
    padding: 14,
  },
  tilePrimary: { backgroundColor: '#208AEF' },
  tileLabel: { fontSize: 12, color: '#5b6472', fontWeight: '600' },
  tileLabelPrimary: { color: '#dceaff' },
  tileValue: { fontSize: 20, fontWeight: '700', color: '#1a2233', marginTop: 6 },
  tileValuePrimary: { color: '#fff' },
  card: { backgroundColor: '#f4f6f9', borderRadius: 14, padding: 16, marginBottom: 20 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2233', flexShrink: 1 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#208AEF',
    backgroundColor: '#e3f0fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  bigNumber: { fontSize: 28, fontWeight: '700', color: '#1a2233', marginBottom: 8 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#dfe4ea', overflow: 'hidden', marginBottom: 12 },
  progressFill: { height: '100%', backgroundColor: '#208AEF' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { color: '#5b6472', fontSize: 13 },
  summaryValue: { color: '#1a2233', fontSize: 13, fontWeight: '600' },
  muted: { color: '#5b6472', fontSize: 13, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a2233', marginBottom: 10 },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f5',
  },
  orderRowMain: { flexShrink: 1 },
  orderNumber: { fontSize: 14, fontWeight: '700', color: '#1a2233' },
  orderCustomer: { fontSize: 13, color: '#3a4250', marginTop: 2 },
  orderDate: { fontSize: 12, color: '#5b6472', marginTop: 2 },
  orderRowEnd: { alignItems: 'flex-end' },
  orderTotal: { fontSize: 14, fontWeight: '700', color: '#1a2233' },
  orderTotalVoid: { fontSize: 14, fontWeight: '700', color: '#5b6472', textDecorationLine: 'line-through' },
  orderStatus: { fontSize: 11, color: '#5b6472', marginTop: 2, textTransform: 'uppercase' },
});
