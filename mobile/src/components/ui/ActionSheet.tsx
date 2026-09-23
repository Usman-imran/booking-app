import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/lib/theme';

export type SheetAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

// A bottom sheet of actions for one item - the same on Android and iOS,
// unlike the platform action sheets. Closes before running the action, so
// an action that opens another modal doesn't stack on this one.
export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          {/* Swallows taps so they don't reach the backdrop. */}
          <Pressable>
            <View style={styles.handle} />
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
            <View style={styles.list}>
              {actions.map((action) => (
                <Pressable
                  key={action.label}
                  onPress={() => {
                    onClose();
                    action.onPress();
                  }}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}>
                  <View style={[styles.icon, action.destructive && styles.iconDanger]}>
                    <Ionicons name={action.icon} size={18} color={action.destructive ? colors.danger : colors.primary} />
                  </View>
                  <Text style={[styles.label, action.destructive && { color: colors.danger }]}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 30, 51, 0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, paddingHorizontal: spacing.sm },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, paddingHorizontal: spacing.sm },
  list: { marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDanger: { backgroundColor: colors.dangerSoft },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
});
