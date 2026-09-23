import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useIsOnline } from '@/lib/offline/network';
import { usePendingOrders } from '@/lib/offline/offlineQueue';
import { flushQueue, useIsSyncing } from '@/lib/syncService';
import { colors, radius, spacing } from '@/lib/theme';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A one-line strip saying whether the device is offline and how many
// orders are waiting on the device. Renders nothing when online with an
// empty queue - the normal case shouldn't cost any screen space.
export function SyncStatusBar() {
  const online = useIsOnline();
  const syncing = useIsSyncing();
  const pending = usePendingOrders();

  const failed = pending.filter((order) => order.syncState === 'failed').length;
  const waiting = pending.length - failed;

  if (online && pending.length === 0) return null;

  let icon: keyof typeof Ionicons.glyphMap = 'cloud-offline-outline';
  let text: string;
  if (!online) {
    text =
      waiting > 0
        ? `Offline - ${plural(waiting, 'order')} will sync when you're back online.`
        : "Offline - new orders are saved on this device and sync when you're back online.";
  } else if (waiting > 0) {
    icon = 'cloud-upload-outline';
    text = syncing ? `Syncing ${plural(waiting, 'order')}…` : `${plural(waiting, 'order')} waiting to sync.`;
  } else {
    icon = 'alert-circle-outline';
    text = `${plural(failed, 'order')} could not sync - tap ${failed === 1 ? 'it' : 'one'} below to review.`;
  }
  const isProblem = online && waiting === 0 && failed > 0;

  return (
    <View style={[styles.bar, isProblem && styles.barProblem]}>
      <Ionicons name={icon} size={18} color={isProblem ? colors.danger : colors.primaryDark} />
      <Text style={[styles.text, isProblem && styles.textProblem]}>{text}</Text>
      {online && waiting > 0 ? (
        syncing ? (
          <ActivityIndicator size="small" color={colors.primaryDark} />
        ) : (
          <Pressable onPress={() => flushQueue({ ignoreBackoff: true })} hitSlop={8}>
            <Text style={styles.action}>Sync now</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  barProblem: { backgroundColor: colors.dangerSoft },
  text: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.primaryDark },
  textProblem: { color: colors.danger },
  action: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
});
