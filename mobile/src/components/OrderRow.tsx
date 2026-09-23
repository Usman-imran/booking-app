import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from './PressableScale';
import { StatusBadge } from './StatusBadge';
import { cardShadow, colors, formatDateTime, formatRs, radius, spacing } from '@/lib/theme';

export type OrderRowData = {
  id: string | number;
  orderNumber: string;
  status: string;
  total: number;
  submittedAt: string | null;
  createdAt?: string;
  customer?: { name: string; code: string };
};

// One order as a card row - used by both the dashboard's Recent Orders and
// the Orders tab so an order looks the same wherever it appears.
export function OrderRow({ order, onPress }: { order: OrderRowData; onPress?: () => void }) {
  const isCancelled = order.status === 'cancelled';
  return (
    <PressableScale style={styles.row} onPress={onPress}>
      <View style={styles.main}>
        <Text style={styles.number}>{order.orderNumber}</Text>
        <Text style={styles.customer} numberOfLines={1}>
          {order.customer?.name ?? '-'}
        </Text>
        <Text style={styles.date}>{formatDateTime(order.submittedAt ?? order.createdAt ?? null)}</Text>
      </View>
      <View style={styles.end}>
        <Text style={[styles.total, isCancelled && styles.totalVoid]}>{formatRs(order.total)}</Text>
        <StatusBadge status={order.status} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm + 2,
    ...cardShadow,
  },
  main: { flexShrink: 1, paddingRight: spacing.md, gap: 2 },
  number: { fontSize: 14, fontWeight: '700', color: colors.text },
  customer: { fontSize: 13, color: colors.textSecondary },
  date: { fontSize: 12, color: colors.textMuted },
  end: { alignItems: 'flex-end', gap: 6 },
  total: { fontSize: 15, fontWeight: '700', color: colors.text },
  totalVoid: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
