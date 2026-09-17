import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { getDashboard, type DashboardData } from '@/lib/api/dashboard';
import { stackHeader } from '@/lib/stackHeader';
import { cardShadow, colors, formatMoney, radius, spacing } from '@/lib/theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TARGET_STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  achieved: { label: 'Achieved', fg: colors.success, bg: colors.successSoft },
  'in-progress': { label: 'In Progress', fg: colors.primary, bg: colors.primarySoft },
  'not-started': { label: 'Not Started', fg: colors.textMuted, bg: colors.surfaceMuted },
  'no-target': { label: 'No Target Set', fg: colors.warning, bg: colors.warningSoft },
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// Monthly target progress plus the period totals - the detail view behind
// the dashboard's summary cards. Same GET /api/dashboard payload.
export default function Analytics() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getDashboard());
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  const target = data?.target;
  const monthLabel = data ? `${MONTHS[data.month - 1]} ${data.year}` : '';
  const targetStatus = target ? TARGET_STATUS[target.status] ?? TARGET_STATUS['not-started'] : null;
  const percent = target ? Math.min(Math.max(target.achievementPercent, 0), 100) : 0;

  return (
    <>
      <Stack.Screen
        options={{ ...stackHeader, title: 'Analytics' }}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }>
        {status === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {status === 'error' && <ErrorState message={`Could not load analytics: ${error}`} onRetry={load} />}

        {status === 'ready' && data && target && targetStatus ? (
          <>
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <View style={styles.cardTitleWrap}>
                  <Ionicons name="flag" size={18} color={colors.primary} />
                  <Text style={styles.cardTitle}>Monthly Target</Text>
                </View>
                <Text style={[styles.badge, { color: targetStatus.fg, backgroundColor: targetStatus.bg }]}>
                  {targetStatus.label}
                </Text>
              </View>
              <Text style={styles.cardSubtitle}>{monthLabel}</Text>

              {target.targetAmount > 0 ? (
                <>
                  <Text style={styles.bigNumber}>{formatMoney(target.achievementPercent)}%</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${percent}%` }]} />
                  </View>
                  <Row label="Target" value={formatMoney(target.targetAmount)} />
                  <Row label="Achieved" value={formatMoney(target.achieved)} />
                  <Row
                    label={target.remaining < 0 ? 'Exceeded by' : 'Remaining'}
                    value={formatMoney(Math.abs(target.remaining))}
                  />
                </>
              ) : (
                <Text style={styles.muted}>
                  No target set for {monthLabel}. {formatMoney(target.achieved)} achieved so far.
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardTitleWrap}>
                <Ionicons name="calendar" size={18} color={colors.primary} />
                <Text style={styles.cardTitle}>This Month</Text>
              </View>
              <Row label="Orders" value={String(data.monthly.orders)} />
              <Row label="Sales" value={formatMoney(data.monthly.sales)} />
              <Row label="Draft orders" value={String(data.draftOrders)} />
            </View>

            <View style={styles.card}>
              <View style={styles.cardTitleWrap}>
                <Ionicons name="today" size={18} color={colors.primary} />
                <Text style={styles.cardTitle}>Today</Text>
              </View>
              <Row label="Orders" value={String(data.today.orders)} />
              <Row label="Sales" value={formatMoney(data.today.sales)} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  center: { alignItems: 'center', paddingVertical: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardSubtitle: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  bigNumber: { fontSize: 32, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 5 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: 14 },
});
