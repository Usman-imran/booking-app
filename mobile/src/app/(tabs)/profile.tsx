import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { PressableScale } from '@/components/PressableScale';
import { isAdPrivacyOptionsRequired, showAdPrivacyOptions, useAdsStatus } from '@/lib/admob';
import { getDashboard, type DashboardData } from '@/lib/api/dashboard';
import { useAuth } from '@/lib/auth/AuthContext';
import { useIsOnline } from '@/lib/offline/network';
import { readDashboard, saveDashboard, withOfflineFallback } from '@/lib/offline/offlineCache';
import { usePendingOrders } from '@/lib/offline/offlineQueue';
import { FREE_DAILY_ORDER_LIMIT, PRO_PRICE_LABEL, PRO_PRICE_PERIOD, usePlan } from '@/lib/plan';
import { flushQueue, useIsSyncing } from '@/lib/syncService';
import { cardShadow, colors, formatCompactMoney, formatDate, formatMoney, radius, spacing } from '@/lib/theme';
import { useDailyUsage } from '@/lib/usageTracker';
import { useRevalidateOnFocus } from '@/lib/usePaginatedList';

type IconName = keyof typeof Ionicons.glyphMap;

type Tone = 'default' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { fg: string; bg: string }> = {
  default: { fg: colors.primary, bg: colors.primarySoft },
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
};

// The performance badge on the executive card, read off the month's target.
// The wording is about the person, not the number - it is a badge, not a
// second copy of the dashboard's progress bar.
const PERFORMANCE: Record<string, { label: string; icon: IconName; tone: Tone }> = {
  achieved: { label: 'Target achieved', icon: 'trophy', tone: 'success' },
  'in-progress': { label: 'On track', icon: 'trending-up', tone: 'default' },
  'not-started': { label: 'Not started', icon: 'hourglass-outline', tone: 'warning' },
  'no-target': { label: 'No target set', icon: 'flag-outline', tone: 'default' },
};

// --- Building blocks --------------------------------------------------------

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

// One settings row. With `onPress` it is a link (chevron); without, it is a
// reading, with its value on the right. `tone` tints the icon tile, so a row
// that is telling you something - a failed sync - reads at a glance.
function Row({
  icon,
  label,
  value,
  hint,
  tone = 'default',
  onPress,
  last,
}: {
  icon: IconName;
  label: string;
  value?: string | null;
  hint?: string | null;
  tone?: Tone;
  onPress?: () => void;
  last?: boolean;
}) {
  const tint = TONES[tone];

  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: tint.bg }]}>
        <Ionicons name={icon} size={17} color={tint.fg} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, tone === 'danger' && { color: colors.danger }]} numberOfLines={1}>
          {label}
        </Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : null}
    </>
  );

  if (!onPress) return <View style={[styles.row, last && styles.rowLast]}>{content}</View>;

  return (
    <PressableScale style={[styles.row, last && styles.rowLast]} onPress={onPress} accessibilityLabel={label}>
      {content}
    </PressableScale>
  );
}

function Badge({ icon, label, tone, solid }: { icon: IconName; label: string; tone: Tone; solid?: boolean }) {
  const tint = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: solid ? colors.primary : tint.bg }]}>
      <Ionicons name={icon} size={12} color={solid ? '#fff' : tint.fg} />
      <Text style={[styles.badgeText, { color: solid ? '#fff' : tint.fg }]}>{label}</Text>
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statValueRow}>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// --- Screen -----------------------------------------------------------------

export default function Profile() {
  const { user, logout } = useAuth();
  const pendingOrders = usePendingOrders();
  const { isPro, proUntil } = usePlan();
  const online = useIsOnline();
  const syncing = useIsSyncing();
  const usage = useDailyUsage(user?.id ?? null, isPro);

  // This month's figures, purely so the card can say how the month is
  // going. Read through the same saved copy the dashboard uses, so it still
  // says something offline; a failure just leaves the stats off.
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      const { data } = await withOfflineFallback(
        async () => {
          const fresh = await getDashboard();
          saveDashboard(fresh);
          return fresh;
        },
        async () => (await readDashboard())?.data ?? null
      );
      setDashboard(data);
    } catch {
      setDashboard(null);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    // loadDashboard only sets state after its internal `await` - the lint
    // rule can't see across that boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard();
  }, [loadDashboard]);

  useRevalidateOnFocus(loadDashboard);

  // Users shown Google's ad-consent form (EEA/UK etc.) must be able to
  // change their answer later; everyone else never sees this row.
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

  function showAbout() {
    Alert.alert(
      'Booking App',
      `Signed in as ${user?.name} (@${user?.username}).\n\n` +
        `Plan: ${isPro ? 'Pro' : 'Free'}\n` +
        `Orders waiting to sync: ${pendingOrders.length}\n` +
        `This month: Rs ${dashboard ? formatMoney(dashboard.monthly.sales) : '-'}`
    );
  }

  if (!user) return null;

  const performance = dashboard ? PERFORMANCE[dashboard.target.status] : null;
  const failed = pendingOrders.filter((order) => order.syncState === 'failed').length;
  const waiting = pendingOrders.length - failed;

  // What the Sync Status row says, worst news first.
  const sync: { icon: IconName; label: string; tone: Tone; hint: string | null } = !online
    ? {
        icon: 'cloud-offline',
        label: 'Offline',
        tone: 'warning',
        hint: 'Orders you book are saved here and sent when you reconnect.',
      }
    : syncing
      ? { icon: 'sync', label: 'Syncing…', tone: 'default', hint: 'Sending orders saved on this device.' }
      : failed > 0
        ? {
            icon: 'alert-circle',
            label: `${failed} order${failed === 1 ? '' : 's'} could not sync`,
            tone: 'danger',
            hint: 'Open the Orders tab to retry or discard them.',
          }
        : waiting > 0
          ? {
              icon: 'cloud-upload',
              label: `${waiting} waiting to sync`,
              tone: 'warning',
              hint: 'Tap to send them now.',
            }
          : { icon: 'cloud-done', label: 'Everything synced', tone: 'success', hint: null };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* --- Executive card --- */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Avatar name={user.name} size={60} />
            <View style={styles.heroIdentity}>
              <Text style={styles.heroName} numberOfLines={1}>
                {user.name}
              </Text>
              <Text style={styles.heroRole} numberOfLines={1}>
                Order Booker · @{user.username}
              </Text>
              {user.companyName ? (
                <Text style={styles.heroCompany} numberOfLines={1}>
                  {user.companyName}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.heroBadges}>
            <Badge
              icon={user.isActive ? 'checkmark-circle' : 'close-circle'}
              label={user.isActive ? 'Active' : 'Inactive'}
              tone={user.isActive ? 'success' : 'danger'}
            />
            {performance ? (
              <Badge icon={performance.icon} label={performance.label} tone={performance.tone} />
            ) : null}
            <Badge
              icon={isPro ? 'ribbon' : 'rocket-outline'}
              label={isPro ? 'Pro' : 'Free'}
              tone="default"
              solid={isPro}
            />
          </View>

          {loadingStats ? (
            <View style={styles.statsLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : dashboard ? (
            <View style={styles.stats}>
              <Stat label="This month" value={formatCompactMoney(dashboard.monthly.sales)} unit="Rs" />
              <View style={styles.statDivider} />
              <Stat label="Orders" value={String(dashboard.monthly.orders)} />
              <View style={styles.statDivider} />
              <Stat
                label="Of target"
                value={dashboard.target.targetAmount > 0 ? `${Math.round(dashboard.target.achievementPercent)}%` : '—'}
              />
            </View>
          ) : null}
        </View>

        <Group title="Account">
          <Row icon="business-outline" label="Company" value={user.companyName || '-'} />
          <Row icon="call-outline" label="Phone" value={user.phone || '-'} />
          <Row icon="calendar-outline" label="Member since" value={formatDate(user.createdAt)} last />
        </Group>

        <Group title="Business">
          <Row icon="bar-chart-outline" label="Sales Reports" onPress={() => router.push('/reports')} />
          <Row icon="flag-outline" label="Monthly Targets" onPress={() => router.push('/targets')} />
          <Row icon="stats-chart-outline" label="Analytics" onPress={() => router.push('/analytics')} />
          <Row icon="business-outline" label="Companies" onPress={() => router.push('/companies')} last />
        </Group>

        <Group title="Sync Status">
          <Row
            icon={sync.icon}
            label={sync.label}
            hint={sync.hint}
            tone={sync.tone}
            // Only worth tapping when there is something to send.
            onPress={waiting > 0 && online && !syncing ? () => flushQueue({ ignoreBackoff: true }) : undefined}
            last
          />
        </Group>

        <Group title="Subscription Plan">
          <Row
            icon={isPro ? 'ribbon' : 'rocket-outline'}
            label={isPro ? 'Pro plan' : 'Free plan'}
            hint={
              isPro
                ? proUntil
                  ? `Active until ${formatDate(proUntil)}`
                  : 'Unlimited orders, logo on receipts, exports, no ads.'
                : `${usage.used} of ${FREE_DAILY_ORDER_LIMIT} orders booked today · ${PRO_PRICE_LABEL} ${PRO_PRICE_PERIOD} for unlimited`
            }
            onPress={() => router.push('/subscription')}
            last
          />
        </Group>

        <Group title="App Preferences">
          <Row
            icon="settings-outline"
            label="Company & Receipt Settings"
            hint="Business name, tagline and the logo printed on invoices"
            onPress={() => router.push('/settings')}
          />
          <Row
            icon="cloud-upload-outline"
            label="Import Products"
            onPress={() => router.push('/products/import')}
            last={!adPrivacyRequired}
          />
          {adPrivacyRequired ? (
            <Row icon="shield-checkmark-outline" label="Ad privacy choices" onPress={showAdPrivacyOptions} last />
          ) : null}
        </Group>

        <Group title="Help">
          <Row icon="information-circle-outline" label="About this app" onPress={showAbout} />
          <Row icon="log-out-outline" label="Sign out" tone="danger" onPress={confirmLogout} last />
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },

  // Executive card
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.xl,
    ...cardShadow,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIdentity: { flex: 1, gap: 2 },
  heroName: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  heroRole: { fontSize: 12.5, color: colors.textMuted },
  heroCompany: { fontSize: 12.5, fontWeight: '700', color: colors.primaryDark, marginTop: 2 },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },

  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  statsLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  statUnit: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4, marginTop: 3 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },

  // Grouped settings
  group: { marginBottom: spacing.xl },
  groupTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    ...cardShadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  rowHint: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },
  rowValue: { fontSize: 13, color: colors.textMuted, maxWidth: '40%', fontVariant: ['tabular-nums'] },
});
