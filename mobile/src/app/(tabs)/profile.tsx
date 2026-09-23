import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Pill, type Tone } from '@/components/Pill';
import { PressableScale } from '@/components/PressableScale';
import { API_BASE_URL } from '@/lib/api/config';
import { getDashboard, type DashboardData } from '@/lib/api/dashboard';
import { useAuth } from '@/lib/auth/AuthContext';
import { colors, cardShadow, formatCompactRs, formatDate, radius, spacing, typography } from '@/lib/theme';
import { useRevalidateOnFocus } from '@/lib/usePaginatedList';
import { useSyncStatus } from '@/lib/useSyncStatus';

type IconName = keyof typeof Ionicons.glyphMap;

// How the month's target translates into the badge on the executive card.
// The four cases are the dashboard's own target statuses, said the way you
// would say them out loud about a person rather than about a number.
const PERFORMANCE: Record<string, { label: string; tone: Tone; icon: IconName }> = {
  achieved: { label: 'Target Achieved', tone: 'success', icon: 'trophy' },
  'in-progress': { label: 'On Track', tone: 'info', icon: 'trending-up' },
  'not-started': { label: 'Not Started', tone: 'warning', icon: 'hourglass' },
  'no-target': { label: 'No Target Set', tone: 'neutral', icon: 'flag-outline' },
};

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupHeading}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
  onPress,
  danger,
  last,
}: {
  icon: IconName;
  label: string;
  // Shown on the right: a plain reading for an info row, or nothing for a
  // link row, which gets a chevron instead.
  value?: string | null;
  // Tints the icon tile - used to make the sync row read at a glance.
  tone?: 'default' | 'success' | 'danger';
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const tint =
    tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : danger ? colors.danger : colors.primary;
  const tintBg =
    tone === 'success'
      ? colors.successSoft
      : tone === 'danger' || danger
        ? colors.dangerSoft
        : colors.primarySoft;

  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: tintBg }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, last && styles.rowLast]}>{content}</View>;
  }

  return (
    <PressableScale style={[styles.row, last && styles.rowLast]} onPress={onPress} accessibilityLabel={label}>
      {content}
    </PressableScale>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const sync = useSyncStatus();

  // The month's figures, purely so the card can say how the person is
  // doing. A failure here leaves the card without its badge rather than
  // taking the screen down - none of the settings below need it.
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setDashboard(await getDashboard());
    } catch {
      setDashboard(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard();
  }, [loadDashboard]);

  useRevalidateOnFocus(loadDashboard);

  function confirmLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
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
      Constants.expoConfig?.name ?? 'Booking App',
      `Version ${Constants.expoConfig?.version ?? '1.0.0'}\n\nConnected to:\n${API_BASE_URL}`
    );
  }

  function showPlan() {
    Alert.alert(
      'Free plan',
      'Every feature in the app is available on your account at no charge. There is no billing to manage yet.'
    );
  }

  if (!user) return null;

  const performance = dashboard ? PERFORMANCE[dashboard.target.status] : null;
  const achievement = dashboard?.target.achievementPercent ?? 0;

  const syncRow =
    sync.state === 'online'
      ? { label: 'Connected', tone: 'success' as const, icon: 'cloud-done' as IconName }
      : sync.state === 'offline'
        ? { label: 'Cannot reach the server', tone: 'danger' as const, icon: 'cloud-offline' as IconName }
        : { label: 'Checking…', tone: 'default' as const, icon: 'cloud-outline' as IconName };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* --- Executive card --- */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Avatar name={user.name} size={64} />
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
            <Pill
              label={user.isActive ? 'Active' : 'Inactive'}
              tone={user.isActive ? 'success' : 'danger'}
              icon={user.isActive ? 'checkmark-circle' : 'close-circle'}
              uppercase
            />
            {performance ? <Pill label={performance.label} tone={performance.tone} icon={performance.icon} /> : null}
          </View>

          {dashboard ? (
            <View style={styles.heroStats}>
              <Stat label="This month" value={formatCompactRs(dashboard.monthly.sales)} />
              <View style={styles.statDivider} />
              <Stat label="Orders" value={String(dashboard.monthly.orders)} />
              <View style={styles.statDivider} />
              <Stat
                label="Of target"
                value={dashboard.target.targetAmount > 0 ? `${Math.round(achievement)}%` : '—'}
              />
            </View>
          ) : (
            <View style={styles.heroStatsLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
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

        <Group title="App Preferences">
          <Row icon="settings-outline" label="Company & Receipt Settings" onPress={() => router.push('/settings')} />
          <Row icon="cube-outline" label="Import Products" onPress={() => router.push('/products/import')} last />
        </Group>

        <Group title="Sync Status">
          <Row
            icon={syncRow.icon}
            label={syncRow.label}
            tone={syncRow.tone}
            value={sync.checkedAt ? sync.checkedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : undefined}
            onPress={sync.check}
            last
          />
        </Group>

        <Group title="Subscription Plan">
          <Row icon="ribbon-outline" label="Free plan" value="All features" onPress={showPlan} last />
        </Group>

        <Group title="Help">
          <Row icon="information-circle-outline" label="About this app" onPress={showAbout} />
          <Row icon="log-out-outline" label="Sign out" onPress={confirmLogout} danger last />
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },

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
  heroName: { fontSize: 20, fontWeight: '700', color: colors.text },
  heroRole: { fontSize: 13, color: colors.textMuted },
  heroCompany: { fontSize: 13, fontWeight: '600', color: colors.primaryDark, marginTop: 2 },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  heroStatsLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  statValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },

  group: { marginBottom: spacing.xl },
  groupHeading: { ...typography.groupHeading, marginBottom: spacing.sm },
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
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  rowLabelDanger: { color: colors.danger },
  rowValue: { fontSize: 13, color: colors.textMuted, maxWidth: '45%' },
});
