import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/lib/theme';

export type Segment<K extends string> = { key: K; label: string; count?: number };

// A segmented control: one track, the selected segment raised on white.
// Scrolls sideways when the segments don't fit the screen, so labels are
// never truncated.
export function SegmentedControl<K extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll} style={styles.flexNone}>
      <View style={styles.track} accessibilityRole="tablist">
        {segments.map((segment) => {
          const active = segment.key === value;
          return (
            <Pressable
              key={segment.key}
              onPress={() => onChange(segment.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && !active && { opacity: 0.6 }]}>
              <Text style={[styles.label, active && styles.labelActive]}>{segment.label}</Text>
              {segment.count ? (
                <View style={[styles.count, active && styles.countActive]}>
                  <Text style={[styles.countText, active && styles.countTextActive]}>{segment.count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flexNone: { flexGrow: 0 },
  scroll: { paddingHorizontal: spacing.xl },
  track: {
    flexDirection: 'row',
    backgroundColor: '#EBEFF5',
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 7,
    borderRadius: radius.sm + 1,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: '#0f1e33',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  labelActive: { color: colors.text },
  count: { minWidth: 18, paddingHorizontal: 5, height: 18, borderRadius: 9, backgroundColor: '#DCE2EA', alignItems: 'center', justifyContent: 'center' },
  countActive: { backgroundColor: colors.warning },
  countText: { fontSize: 10.5, fontWeight: '800', color: colors.textSecondary },
  countTextActive: { color: '#fff' },
});
