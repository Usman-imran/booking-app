import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { ProPlanDetails } from '@/components/subscription/ProPlanDetails';
import type { PaywallReason } from '@/lib/plan';
import { stackHeader } from '@/lib/stackHeader';
import { colors, spacing } from '@/lib/theme';

const REASONS: PaywallReason[] = ['order_limit', 'logo', 'export', 'upgrade'];

// The plan screen, reached from Profile: the Free-vs-Pro offer for a Free
// account, or what their subscription covers for a Pro one.
export default function Route() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Subscription' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <ProPlanDetails reason={REASONS.includes(reason as PaywallReason) ? (reason as PaywallReason) : 'upgrade'} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
});
