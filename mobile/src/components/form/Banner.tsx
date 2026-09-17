import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/lib/theme';

type Kind = 'error' | 'success' | 'info';

type Props = { kind: Kind; children: React.ReactNode; onDismiss?: () => void };

const KIND_STYLES: Record<Kind, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' },
  success: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' },
  info: { bg: colors.primarySoft, fg: colors.primaryDark, icon: 'information-circle' },
};

// The mobile counterpart of the web's banner-error / banner-success /
// banner-info blocks.
export function Banner({ kind, children, onDismiss }: Props) {
  const look = KIND_STYLES[kind];
  return (
    <View style={[styles.banner, { backgroundColor: look.bg }]}>
      <Ionicons name={look.icon} size={20} color={look.fg} style={styles.icon} />
      <Text style={[styles.text, { color: look.fg }]}>{children}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Ionicons name="close" size={18} color={look.fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  icon: { marginTop: 1 },
  text: { flex: 1, fontSize: 14, lineHeight: 20 },
});
