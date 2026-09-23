import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { colors, radius, spacing, subtleShadow } from '@/lib/theme';

export type Segment<T extends string> = { key: T; label: string; count?: number };

type Props<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
};

const SPRING = { damping: 20, stiffness: 220, mass: 0.7 } as const;

// An iOS-style segmented control: one white thumb that slides between the
// options rather than four buttons that light up. Used for the order status
// filter, where the options are a fixed, mutually exclusive set - unlike the
// chips on Customers and Products, which are filters you toggle.
//
// The thumb is positioned from the measured track width, so the segments
// stay equal even when a label is much longer than the rest.
export function SegmentedControl<T extends string>({ segments, value, onChange }: Props<T>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const activeIndex = Math.max(
    0,
    segments.findIndex((segment) => segment.key === value)
  );
  const segmentWidth = segments.length > 0 ? trackWidth / segments.length : 0;

  const thumbStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: withSpring(segmentWidth * activeIndex, SPRING) }],
  }));

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  return (
    <View style={styles.track} onLayout={handleLayout}>
      {trackWidth > 0 ? <Animated.View style={[styles.thumb, thumbStyle]} /> : null}
      {segments.map((segment) => {
        const active = segment.key === value;
        return (
          <Pressable
            key={segment.key}
            onPress={() => onChange(segment.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={styles.segment}>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {segment.label}
            </Text>
            {segment.count !== undefined ? (
              <View style={[styles.count, active && styles.countActive]}>
                <Text style={[styles.countText, active && styles.countTextActive]}>{segment.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.track,
    borderRadius: radius.md,
    padding: 3,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: colors.surface,
    borderRadius: radius.md - 3,
    ...subtleShadow,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: spacing.xs,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  labelActive: { color: colors.text },
  count: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  countActive: { backgroundColor: colors.primarySoft },
  countText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  countTextActive: { color: colors.primaryDark },
});
