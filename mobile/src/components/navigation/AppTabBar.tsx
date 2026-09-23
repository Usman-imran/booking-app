import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdBannerSlot } from '@/components/AdBannerSlot';
import { colors, layout, radius, spacing, typography } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// Filled when the tab is the one you're on, outlined otherwise - the
// convention on both platforms. Keyed by route name so a screen's options
// stay about the screen and the bar owns how the bar looks.
const ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  index: { active: 'home', inactive: 'home-outline' },
  orders: { active: 'receipt', inactive: 'receipt-outline' },
  customers: { active: 'people', inactive: 'people-outline' },
  products: { active: 'cube', inactive: 'cube-outline' },
  profile: { active: 'person-circle', inactive: 'person-circle-outline' },
};

const FALLBACK_ICON = { active: 'ellipse' as IconName, inactive: 'ellipse-outline' as IconName };

// The spring every tab shares. Tuned short and slightly damped: the pill
// should feel like it snapped into place by the time your finger lifts,
// never like it is still catching up.
const SPRING = { damping: 18, stiffness: 240, mass: 0.6 } as const;

function TabItem({
  routeName,
  label,
  badge,
  isFocused,
  onPress,
  onLongPress,
}: {
  routeName: string;
  label: string;
  badge?: string | number;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  // 0 = at rest, 1 = this is the current tab. Everything on the item is
  // derived from this one value so the pill, the lift and the colour can
  // never disagree mid-animation.
  const focus = useSharedValue(isFocused ? 1 : 0);
  // Separate from focus: a quick dip while the finger is down.
  const press = useSharedValue(0);

  useEffect(() => {
    // `.set()` rather than `.value =`: assigning to a shared value reads as
    // mutating a hook result to the React Compiler, which this project has
    // switched on.
    focus.set(withSpring(isFocused ? 1 : 0, SPRING));
  }, [isFocused, focus]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: focus.get(),
    transform: [{ scaleX: interpolate(focus.get(), [0, 1], [0.6, 1]) }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(focus.get(), [0, 1], [0, -1]) },
      { scale: interpolate(focus.get(), [0, 1], [1, 1.08]) * interpolate(press.get(), [0, 1], [1, 0.9]) },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focus.get(), [0, 1], [colors.textMuted, colors.primary]),
    opacity: interpolate(focus.get(), [0, 1], [0.85, 1]),
  }));

  const icon = ICONS[routeName] ?? FALLBACK_ICON;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        press.set(withTiming(1, { duration: 90 }));
      }}
      onPressOut={() => {
        press.set(withSpring(0, SPRING));
      }}
      style={styles.item}>
      <View style={styles.iconRow}>
        <Animated.View style={[styles.pill, pillStyle]} />
        <Animated.View style={iconStyle}>
          <Ionicons
            name={isFocused ? icon.active : icon.inactive}
            size={22}
            color={isFocused ? colors.primary : colors.textMuted}
          />
        </Animated.View>
        {badge !== undefined && badge !== null && badge !== '' ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

// The app's bottom bar, drawn by hand rather than by the navigator so the
// active pill, the icon lift and the ad slot can share one layout. The
// banner sits INSIDE the bar's container, which is what keeps every screen's
// content above it without a single screen padding for an ad it can't see.
export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <AdBannerSlot />
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);

          function handlePress() {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            // Tapping the tab you're already on is a no-op here; the
            // navigator's own listener handles "scroll to top".
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          }

          function handleLongPress() {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          }

          return (
            <TabItem
              key={route.key}
              routeName={route.name}
              label={label}
              badge={options.tabBarBadge}
              isFocused={isFocused}
              onPress={handlePress}
              onLongPress={handleLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    // iOS draws the shadow upwards from the bar; Android only gets the
    // hairline, which is the platform's own convention anyway.
    ...Platform.select({
      ios: { shadowColor: '#0f1e33', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
      default: {},
    }),
  },
  row: { flexDirection: 'row', height: layout.tabBarRowHeight, paddingTop: spacing.sm },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 2 },
  iconRow: { alignItems: 'center', justifyContent: 'center', height: 28, minWidth: 52 },
  pill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.full,
  },
  label: { ...typography.badge, fontSize: 11, letterSpacing: 0.1 },
  badge: {
    position: 'absolute',
    top: -2,
    right: 10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    backgroundColor: colors.dangerStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
