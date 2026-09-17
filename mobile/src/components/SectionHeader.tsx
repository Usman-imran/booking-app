import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/lib/theme';

type Props = { title: string; actionLabel?: string; onAction?: () => void };

export function SectionHeader({ title, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          {({ pressed }) => <Text style={[styles.action, pressed && { opacity: 0.6 }]}>{actionLabel}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  action: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
