import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Pill, type Tone } from './Pill';
import { PressableScale } from './PressableScale';
import type { OrderStatus } from '@/lib/api/orders';
import { cardShadow, colors, formatDateTime, formatRs, radius, spacing, typography } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export type OrderCardData = {
  id: string | number;
  orderNumber: string;
  status: string;
  total: number;
  submittedAt: string | null;
  createdAt?: string;
  customer?: { name: string; code: string };
};

// How each status reads on a card. Drafts are the booker's own unfinished
// work, so they get the "pending" wording the status filter uses rather
// than the database word.
const STATUS_TONE: Record<OrderStatus | string, { label: string; tone: Tone; icon: IconName }> = {
  submitted: { label: 'Completed', tone: 'success', icon: 'checkmark-circle' },
  draft: { label: 'Pending', tone: 'warning', icon: 'time' },
  cancelled: { label: 'Cancelled', tone: 'danger', icon: 'close-circle' },
};

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

type Props = {
  order: OrderCardData;
  onPress: () => void;
  onReorder: () => void;
  onShare: () => void;
  // Whether the quick-action strip is open. The Orders screen keeps this so
  // only one card is expanded at a time - two open strips make the list
  // jump around and neither is the one you meant.
  expanded: boolean;
  onToggleActions: () => void;
};

// One order in the list: who it is for, what it came to, and what you would
// do with it next. Tapping the card opens it; the chevron reveals the quick
// actions, which are the three things a booker does to an order they can
// already see - look at it, repeat it, or hand the customer the receipt.
export function OrderCard({ order, onPress, onReorder, onShare, expanded, onToggleActions }: Props) {
  const status = STATUS_TONE[order.status] ?? { label: order.status, tone: 'neutral' as Tone, icon: 'ellipse' as IconName };
  const isCancelled = order.status === 'cancelled';
  // A draft has no order number until it is submitted, so there is nothing
  // to put on a receipt yet.
  const canShare = order.status !== 'draft';

  return (
    <View style={styles.card}>
      <PressableScale style={styles.body} onPress={onPress} accessibilityLabel={`Order ${order.orderNumber}`}>
        <View style={styles.main}>
          <View style={styles.topRow}>
            <Text style={styles.number} numberOfLines={1}>
              {order.orderNumber}
            </Text>
            <Pill label={status.label} tone={status.tone} icon={status.icon} uppercase />
          </View>
          <Text style={styles.customer} numberOfLines={1}>
            {order.customer?.name ?? 'No customer'}
          </Text>
          <View style={styles.bottomRow}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            <Text style={styles.date}>{formatDateTime(order.submittedAt ?? order.createdAt ?? null)}</Text>
          </View>
        </View>

        <View style={styles.end}>
          <Text style={[styles.total, isCancelled && styles.totalVoid]} numberOfLines={1}>
            {formatRs(order.total)}
          </Text>
          <Pressable
            onPress={onToggleActions}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Hide quick actions' : 'Show quick actions'}
            style={({ pressed }) => [styles.chevron, expanded && styles.chevronOpen, pressed && styles.actionPressed]}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'ellipsis-horizontal'}
              size={16}
              color={expanded ? colors.primary : colors.textMuted}
            />
          </Pressable>
        </View>
      </PressableScale>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)} style={styles.actions}>
          <QuickAction icon="eye-outline" label="Details" onPress={onPress} />
          <View style={styles.actionDivider} />
          <QuickAction icon="repeat-outline" label="Re-order" onPress={onReorder} />
          {canShare ? (
            <>
              <View style={styles.actionDivider} />
              <QuickAction icon="share-social-outline" label="Receipt" onPress={onShare} />
            </>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...cardShadow,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  main: { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  number: { ...typography.cardTitle, fontSize: 14 },
  customer: { fontSize: 15, fontWeight: '600', color: colors.text },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  date: typography.cardMeta,
  end: { alignItems: 'flex-end', gap: spacing.sm },
  total: typography.money,
  totalVoid: { color: colors.textMuted, textDecorationLine: 'line-through' },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  chevronOpen: { backgroundColor: colors.primarySoft },

  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
  },
  actionPressed: { opacity: 0.6 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: colors.primary },
  actionDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
