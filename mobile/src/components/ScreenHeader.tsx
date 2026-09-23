import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from './PressableScale';
import { colors, radius, spacing, typography } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export type HeaderAction = { icon: IconName; label: string; onPress: () => void; primary?: boolean };

type Props = {
  title: string;
  subtitle?: string | null;
  // Icon-only buttons on the right, left to right.
  actions?: HeaderAction[];
  // A labelled pill button after the icons - the screen's main verb.
  cta?: { icon: IconName; label: string; onPress: () => void };
};

// The title block every list tab opens with. One component so "Orders",
// "Customers" and "Products" line up to the pixel instead of each screen
// re-deciding its own title size and button shapes.
export function ScreenHeader({ title, subtitle, actions = [], cta }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [
              styles.iconButton,
              action.primary && styles.iconButtonPrimary,
              pressed && styles.pressed,
            ]}>
            <Ionicons name={action.icon} size={20} color={action.primary ? '#fff' : colors.primary} />
          </Pressable>
        ))}

        {cta ? (
          <PressableScale style={styles.cta} onPress={cta.onPress} accessibilityLabel={cta.label}>
            <Ionicons name={cta.icon} size={18} color="#fff" />
            <Text style={styles.ctaText}>{cta.label}</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  titleBlock: { flexShrink: 1 },
  title: typography.screenTitle,
  subtitle: typography.screenSubtitle,
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  iconButtonPrimary: { backgroundColor: colors.primary },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    height: 40,
  },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
