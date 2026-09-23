import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, formatDateTime, formatMoney, radius, spacing } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export type OrderCardData = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  submittedAt: string | null;
  createdAt?: string | null;
  customer?: { name: string; code: string } | null;
};

const STATUS_ICON: Record<string, { icon: IconName; fg: string; bg: string }> = {
  submitted: { icon: 'checkmark', fg: colors.success, bg: colors.successSoft },
  draft: { icon: 'create-outline', fg: colors.warning, bg: colors.warningSoft },
  cancelled: { icon: 'close', fg: colors.danger, bg: colors.dangerSoft },
  pending_sync: { icon: 'cloud-upload-outline', fg: colors.primaryDark, bg: colors.primarySoft },
  sync_failed: { icon: 'alert', fg: colors.danger, bg: colors.dangerSoft },
};

// One order as a card: status at a glance on the left, who and when in the
// middle, the amount and its badge on the right. `onMore` adds the ⋯
// button (and long-press) for the order's quick actions.
export function OrderCard({
  order,
  onPress,
  onMore,
}: {
  order: OrderCardData;
  onPress: () => void;
  onMore?: () => void;
}) {
  const look = STATUS_ICON[order.status] ?? STATUS_ICON.submitted;
  const isCancelled = order.status === 'cancelled';
  const number = order.orderNumber || (order.status === 'draft' ? 'Draft' : '-');

  return (
    <PressableScale style={styles.card} onPress={onPress} onLongPress={onMore} delayLongPress={300}>
      <View style={[styles.icon, { backgroundColor: look.bg }]}>
        <Ionicons name={look.icon} size={17} color={look.fg} />
      </View>
      <View style={styles.main}>
        <Text style={styles.customer} numberOfLines={1}>
          {order.customer?.name ?? '-'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {number} · {formatDateTime(order.submittedAt ?? order.createdAt ?? null)}
        </Text>
      </View>
      <View style={styles.end}>
        <Text style={[styles.total, isCancelled && styles.totalVoid]}>
          <Text style={styles.currency}>Rs </Text>
          {formatMoney(order.total)}
        </Text>
        <StatusBadge status={order.status} />
      </View>
      {onMore ? (
        <Pressable
          onPress={onMore}
          hitSlop={10}
          style={({ pressed }) => [styles.more, pressed && { backgroundColor: colors.surfaceMuted }]}
          accessibilityLabel={`Actions for ${number}`}>
          <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    marginBottom: spacing.sm,
  },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 3 },
  customer: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  end: { alignItems: 'flex-end', gap: 5 },
  total: { fontSize: 14.5, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  currency: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  totalVoid: { color: colors.textMuted, textDecorationLine: 'line-through' },
  more: { width: 30, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
