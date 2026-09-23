import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProPlanDetails } from './ProPlanDetails';
import type { PaywallReason } from '@/lib/plan';
import { colors, radius, spacing } from '@/lib/theme';

// The upgrade offer as a bottom sheet, opened where a Free account meets a
// Pro limit - the daily order cap, the receipt logo, a report export. It
// only ever informs: closing it leaves the booker exactly where they were.
export function PaywallModal({
  visible,
  reason,
  onClose,
}: {
  visible: boolean;
  reason: PaywallReason;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <ProPlanDetails reason={reason} />
            <Pressable onPress={onClose} hitSlop={8} style={styles.notNow}>
              <Text style={styles.notNowText}>Not now</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 30, 51, 0.45)' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
  },
  close: { position: 'absolute', top: spacing.md, right: spacing.lg, zIndex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.lg },
  notNow: { alignSelf: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  notNowText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
});
