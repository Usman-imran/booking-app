import { StyleSheet, Text } from 'react-native';

import { STATUS_STYLES, colors, radius } from '@/lib/theme';

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { fg: colors.textMuted, bg: colors.surfaceMuted, label: status };
  return (
    <Text style={[styles.badge, { color: style.fg, backgroundColor: style.bg }]}>{style.label}</Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
