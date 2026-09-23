import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { PressableScale } from './PressableScale';
import { colors, floatingShadow, layout, radius, spacing } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  icon: IconName;
  label: string;
  onPress: () => void;
  // Extended (icon + text) rather than the plain circle. Use it when the
  // action needs naming; the circle when the icon says it on its own.
  extended?: boolean;
};

// The screen's one primary action, floating clear of the list. It sits above
// the tab bar rather than over it, because the navigator lays the bar out
// below the screen - so `bottom` here is measured from the top of the bar.
export function FAB({ icon, label, onPress, extended }: Props) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.wrap}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.fab, extended && styles.fabExtended]}>
        <Ionicons name={icon} size={24} color="#fff" />
        {extended ? <Text style={styles.label}>{label}</Text> : null}
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: layout.fabInset, bottom: layout.fabInset },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: layout.fabSize,
    height: layout.fabSize,
    borderRadius: layout.fabSize / 2,
    backgroundColor: colors.primary,
    ...floatingShadow,
  },
  fabExtended: { width: 'auto', paddingHorizontal: spacing.xl, borderRadius: radius.full },
  label: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
