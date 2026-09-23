import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export type Chip<T extends string> = { key: T; label: string; icon?: IconName };

type Props<T extends string> = {
  chips: Chip<T>[];
  // Which chips are on. A single-select carousel passes one key.
  selected: readonly T[];
  onToggle: (key: T) => void;
  // Rendered before the chips and kept out of the scroll - used for the
  // grid/list toggle on Products.
  leading?: ReactNode;
};

// A horizontally scrolling row of filter chips. Deliberately dumb: the
// screen decides whether toggling one clears the others, because Customers
// wants several at once and the company carousel on Products wants one.
export function FilterChips<T extends string>({ chips, selected, onToggle, leading }: Props<T>) {
  return (
    <View style={styles.row}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, leading ? styles.scrollAfterLeading : null]}
        keyboardShouldPersistTaps="handled">
        {chips.map((chip) => {
          const active = selected.includes(chip.key);
          return (
            <Pressable
              key={chip.key}
              onPress={() => onToggle(chip.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}>
              {chip.icon ? (
                <Ionicons name={chip.icon} size={14} color={active ? '#fff' : colors.textMuted} />
              ) : null}
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  leading: { paddingLeft: spacing.xl },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  // The leading slot already supplies the screen's left gutter.
  scrollAfterLeading: { paddingLeft: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  labelActive: { color: '#fff' },
});
