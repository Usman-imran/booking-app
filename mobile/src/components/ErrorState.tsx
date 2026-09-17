import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from './PressableScale';
import { colors, radius, spacing } from '@/lib/theme';

type Props = { message: string; onRetry: () => void };

export function ErrorState({ message, onRetry }: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={32} color={colors.danger} />
      <Text style={styles.message}>{message}</Text>
      <PressableScale style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>Try again</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  message: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  button: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  buttonText: { color: colors.text, fontWeight: '600' },
});
