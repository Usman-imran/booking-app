import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { PressableScale } from '@/components/PressableScale';
import { isAdPrivacyOptionsRequired, showAdPrivacyOptions, useAdsStatus } from '@/lib/admob';
import { useAuth } from '@/lib/auth/AuthContext';
import { usePendingOrders } from '@/lib/offline/offlineQueue';
import { PRO_PRICE_LABEL, PRO_PRICE_PERIOD, usePlan } from '@/lib/plan';
import { cardShadow, colors, formatDate, radius, spacing } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function LinkRow({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  return (
    <PressableScale style={[styles.infoRow, last && styles.infoRowLast]} onPress={onPress}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.linkText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </PressableScale>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const pendingOrders = usePendingOrders();
  const { isPro, proUntil } = usePlan();
  // Users who were shown Google's ad-consent form (EEA/UK etc.) must be able
  // to change their answer later; everyone else never sees this row.
  const adsStatus = useAdsStatus();
  const [adPrivacyRequired, setAdPrivacyRequired] = useState(false);
  useEffect(() => {
    let cancelled = false;
    isAdPrivacyOptionsRequired().then((required) => {
      if (!cancelled) setAdPrivacyRequired(required);
    });
    return () => {
      cancelled = true;
    };
  }, [adsStatus]);

  function confirmLogout() {
    // Queued orders are kept on the device under this account, but only
    // sync while it is signed in - worth saying before they go quiet.
    const pendingNote =
      pendingOrders.length > 0
        ? `\n\n${pendingOrders.length} order${pendingOrders.length === 1 ? ' has' : 's have'} not synced yet. ` +
          'They stay on this device and are sent the next time you sign in to this account.'
        : '';
    Alert.alert('Sign out', `Are you sure you want to sign out?${pendingNote}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/sign-in');
        },
      },
    ]);
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Avatar name={user.name} size={88} />
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.username}>@{user.username}</Text>
          <Text style={[styles.statusPill, user.isActive ? styles.statusActive : styles.statusInactive]}>
            {user.isActive ? 'Active account' : 'Inactive account'}
          </Text>
        </View>

        <View style={styles.card}>
          <InfoRow icon="business-outline" label="Company" value={user.companyName || '-'} />
          <InfoRow icon="call-outline" label="Phone" value={user.phone || '-'} />
          <InfoRow icon="calendar-outline" label="Member since" value={formatDate(user.createdAt)} />
        </View>

        {/* The plan, and the way to Pro. */}
        <PressableScale style={[styles.planCard, isPro && styles.planCardPro]} onPress={() => router.push('/subscription')}>
          <View style={[styles.planIcon, isPro && styles.planIconPro]}>
            <Ionicons name={isPro ? 'ribbon' : 'rocket-outline'} size={22} color={isPro ? '#fff' : colors.primary} />
          </View>
          <View style={styles.planText}>
            <Text style={[styles.planTitle, isPro && styles.onPro]}>{isPro ? 'Pro plan' : 'Upgrade to Pro'}</Text>
            <Text style={[styles.planMeta, isPro && styles.onProMuted]}>
              {isPro
                ? proUntil ? `Active until ${formatDate(proUntil)}` : 'Active'
                : `Unlimited orders, logo on receipts, exports, no ads · ${PRO_PRICE_LABEL} ${PRO_PRICE_PERIOD}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={isPro ? '#fff' : colors.textMuted} />
        </PressableScale>

        <Text style={styles.sectionTitle}>Manage</Text>
        <View style={styles.card}>
          <LinkRow icon="people-outline" label="Customers" onPress={() => router.push('/customers')} />
          <LinkRow icon="business-outline" label="Companies" onPress={() => router.push('/companies')} />
          <LinkRow icon="bar-chart-outline" label="Sales Reports" onPress={() => router.push('/reports')} />
          <LinkRow icon="flag-outline" label="Targets" onPress={() => router.push('/targets')} />
          <LinkRow icon="stats-chart-outline" label="Analytics" onPress={() => router.push('/analytics')} />
          {adPrivacyRequired ? (
            <LinkRow icon="shield-checkmark-outline" label="Ad privacy choices" onPress={showAdPrivacyOptions} />
          ) : null}
          <LinkRow icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} last />
        </View>

        <PressableScale style={styles.logoutButton} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Sign out</Text>
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  planCardPro: { backgroundColor: colors.primary },
  planIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planIconPro: { backgroundColor: 'rgba(255,255,255,0.2)' },
  planText: { flex: 1, gap: 2 },
  planTitle: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  planMeta: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  onPro: { color: '#fff' },
  onProMuted: { color: '#dceaff' },
  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  username: { fontSize: 14, color: colors.textMuted },
  statusPill: {
    marginTop: spacing.sm,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  statusActive: { color: colors.success, backgroundColor: colors.successSoft },
  statusInactive: { color: colors.danger, backgroundColor: colors.dangerSoft },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xl,
    ...cardShadow,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 12, color: colors.textMuted },
  infoValue: { fontSize: 15, color: colors.text, fontWeight: '500', marginTop: 2 },
  infoRowLast: { borderBottomWidth: 0 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  linkText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
});
