import { StyleSheet, Text, View } from 'react-native';

import { cardShadow, colors, radius, spacing } from '@/lib/theme';

export type DetailItem = { label: string; value: string | number | null | undefined; highlight?: boolean };

// A titled card of label/value pairs - the mobile counterpart of the web's
// detail-card + detail-grid. Empty values render as an em dash, as on web.
export function DetailCard({ title, items }: { title?: string; items: DetailItem[] }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {items.map((item, index) => (
        <View key={item.label} style={[styles.row, index === 0 && styles.rowFirst]}>
          <Text style={styles.label}>{item.label}</Text>
          <Text style={[styles.value, item.highlight && styles.highlight]} selectable>
            {item.value === null || item.value === undefined || item.value === '' ? '—' : String(item.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowFirst: { borderTopWidth: 0 },
  label: { fontSize: 13, color: colors.textMuted, flexShrink: 0 },
  value: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1, textAlign: 'right' },
  highlight: { color: colors.success },
});
