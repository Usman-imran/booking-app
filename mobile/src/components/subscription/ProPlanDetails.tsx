import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/form/Banner';
import { Button } from '@/components/form/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  FREE_DAILY_ORDER_LIMIT,
  isProUser,
  PLAN_FEATURES,
  PRO_PRICE_LABEL,
  PRO_PRICE_PERIOD,
  purchasePro,
  type PaywallReason,
} from '@/lib/plan';
import { cardShadow, colors, radius, spacing } from '@/lib/theme';

const HEADLINES: Record<PaywallReason, { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = {
  order_limit: {
    icon: 'speedometer-outline',
    title: "You've hit today's order limit",
    body: `The Free plan allows ${FREE_DAILY_ORDER_LIMIT} new orders a day, and it resets at midnight. Go Pro to keep booking without a cap.`,
  },
  logo: {
    icon: 'image-outline',
    title: 'Put your logo on every receipt',
    body: 'Pro prints your business logo at the top of every JPG and PDF receipt you send.',
  },
  export: {
    icon: 'document-text-outline',
    title: 'Export your sales reports',
    body: 'Pro exports any report to a spreadsheet file that opens in Excel or Google Sheets.',
  },
  upgrade: {
    icon: 'rocket-outline',
    title: 'Upgrade to Pro',
    body: 'Unlimited orders, your own branding on receipts, spreadsheet exports, and no ads.',
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Mark({ value, pro }: { value: string | boolean; pro?: boolean }) {
  if (typeof value === 'string') {
    return <Text style={[styles.cellText, pro && styles.cellTextPro]}>{value}</Text>;
  }
  return value ? (
    <Ionicons name="checkmark-circle" size={20} color={pro ? colors.primary : colors.success} />
  ) : (
    <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
  );
}

// The Free-vs-Pro pitch: why the booker is here, the price, the comparison
// and the way to buy. Shared by the paywall modal and the Subscription
// screen, so the offer reads the same wherever it's met. For a Pro account
// it becomes a summary of what they have.
export function ProPlanDetails({ reason = 'upgrade' }: { reason?: PaywallReason }) {
  const { user, refreshUser } = useAuth();
  const isPro = isProUser(user);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(null);
  const headline = isPro
    ? {
        icon: 'ribbon-outline' as const,
        title: "You're on Pro",
        body: user?.proUntil ? `Your subscription is active until ${formatDate(user.proUntil)}.` : 'Your subscription is active.',
      }
    : HEADLINES[reason];

  // After paying on WhatsApp the admin activates the account on the server;
  // this re-reads the session so the app unlocks without signing out.
  async function checkStatus() {
    setChecking(true);
    setNote(null);
    try {
      const fresh = await refreshUser();
      setNote(
        isProUser(fresh)
          ? { kind: 'success', text: 'Pro is active. Everything is unlocked.' }
          : { kind: 'info', text: 'Not activated yet. It can take a little while after payment is confirmed.' }
      );
    } catch (err) {
      setNote({ kind: 'error', text: err instanceof Error ? err.message : 'Could not check your plan.' });
    } finally {
      setChecking(false);
    }
  }

  return (
    <View>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name={headline.icon} size={28} color={colors.primary} />
        </View>
        <Text style={styles.title}>{headline.title}</Text>
        <Text style={styles.body}>{headline.body}</Text>
      </View>

      <View style={styles.priceCard}>
        <View style={styles.proPill}>
          <Ionicons name="star" size={12} color="#fff" />
          <Text style={styles.proPillText}>PRO</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{PRO_PRICE_LABEL}</Text>
          <Text style={styles.period}>{PRO_PRICE_PERIOD}</Text>
        </View>
        <Text style={styles.priceNote}>Billed monthly. Cancel any time - you simply go back to Free.</Text>
      </View>

      <View style={styles.table}>
        <View style={[styles.row, styles.headRow]}>
          <Text style={[styles.featureCell, styles.headText]}>Feature</Text>
          <Text style={[styles.planCell, styles.headText]}>Free</Text>
          <View style={[styles.planCell, styles.proHead]}>
            <Text style={[styles.headText, styles.proHeadText]}>Pro</Text>
          </View>
        </View>
        {PLAN_FEATURES.map((feature, index) => (
          <View key={feature.label} style={[styles.row, index === PLAN_FEATURES.length - 1 && styles.rowLast]}>
            <Text style={styles.featureCell}>{feature.label}</Text>
            <View style={styles.planCell}>
              <Mark value={feature.free} />
            </View>
            <View style={[styles.planCell, styles.proCol]}>
              <Mark value={feature.pro} pro />
            </View>
          </View>
        ))}
      </View>

      {note ? (
        <Banner kind={note.kind} onDismiss={() => setNote(null)}>
          {note.text}
        </Banner>
      ) : null}

      {isPro ? null : (
        <>
          <Button
            title={`Upgrade on WhatsApp · ${PRO_PRICE_LABEL}`}
            icon="logo-whatsapp"
            onPress={() => purchasePro(user)}
            style={styles.cta}
          />
          <Text style={styles.howTo}>
            Send the message, pay the admin, and your account is switched to Pro - usually within the hour.
          </Text>
          <Button
            title="I've paid - check my plan"
            variant="secondary"
            onPress={checkStatus}
            loading={checking}
            disabled={checking}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: spacing.xs },
  priceCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  proPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  proPillText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginTop: spacing.sm },
  price: { color: '#fff', fontSize: 30, fontWeight: '800' },
  period: { color: '#dceaff', fontSize: 15, fontWeight: '600' },
  priceNote: { color: '#dceaff', fontSize: 12, marginTop: spacing.xs },
  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 46,
  },
  rowLast: { borderBottomWidth: 0 },
  headRow: { backgroundColor: colors.surfaceMuted, minHeight: 38 },
  headText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  featureCell: { flex: 1, fontSize: 13, color: colors.text, paddingHorizontal: spacing.md, textAlign: 'left' },
  planCell: { width: 76, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  proHead: { backgroundColor: colors.primary },
  proHeadText: { color: '#fff' },
  proCol: { backgroundColor: colors.primarySoft },
  cellText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  cellTextPro: { color: colors.primaryDark, fontWeight: '800' },
  cta: { marginTop: spacing.sm },
  howTo: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 17, marginVertical: spacing.md },
});
