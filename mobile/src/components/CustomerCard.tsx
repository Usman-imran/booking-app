import { Ionicons } from '@expo/vector-icons';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from './Avatar';
import { Pill } from './Pill';
import { PressableScale } from './PressableScale';
import type { Customer } from '@/lib/api/customers';
import { cardShadow, colors, formatRs, radius, spacing, typography } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// Strips spaces, dashes and brackets so a number typed as "0300-123 4567"
// still dials, and turns a local Pakistani number into the international
// form WhatsApp requires (wa.me will not take a leading 0).
function toDialable(phone: string) {
  return phone.replace(/[^\d+]/g, '');
}

function toWhatsAppNumber(phone: string) {
  const digits = toDialable(phone);
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('00')) return digits.slice(2);
  // A local 03xx number is the same subscriber as +92 3xx.
  if (digits.startsWith('0')) return `92${digits.slice(1)}`;
  return digits;
}

async function openLink(url: string, unavailable: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Not available', unavailable);
  }
}

function ContactButton({
  icon,
  label,
  tint,
  background,
  onPress,
}: {
  icon: IconName;
  label: string;
  tint: string;
  background: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.contactButton, { backgroundColor: background }, pressed && styles.pressed]}>
      <Ionicons name={icon} size={18} color={tint} />
    </Pressable>
  );
}

type Props = {
  customer: Customer;
  // Value of this customer's unsubmitted orders; 0 means nothing open.
  pendingTotal: number;
  onPress: () => void;
};

// A customer as a contact card: who the shop is, who you speak to there,
// and the two things a booker does from a list of shops - ring them, or
// message them. The balance pill is the one number worth seeing without
// opening the customer.
export function CustomerCard({ customer, pendingTotal, onPress }: Props) {
  const phone = customer.phone?.trim() || customer.alternatePhone?.trim() || null;
  const hasPending = pendingTotal > 0;

  function call() {
    if (!phone) return;
    // `tel:` is the same on both platforms; Android needs no confirmation
    // step, iOS shows its own.
    openLink(`tel:${toDialable(phone)}`, 'This device cannot place calls.');
  }

  function whatsapp() {
    if (!phone) return;
    const number = toWhatsAppNumber(phone);
    // wa.me opens the app when it is installed and the web client when it
    // is not, which is the behaviour people expect on both platforms.
    openLink(
      Platform.OS === 'web' ? `https://wa.me/${number}` : `whatsapp://send?phone=${number}`,
      'WhatsApp is not installed on this device.'
    );
  }

  return (
    <PressableScale style={styles.card} onPress={onPress} accessibilityLabel={customer.name}>
      <View style={styles.top}>
        <Avatar name={customer.name} size={44} />

        <View style={styles.identity}>
          <Text style={styles.shop} numberOfLines={1}>
            {customer.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {customer.code}
            {customer.cityArea ? ` · ${customer.cityArea}` : ''}
          </Text>
          {customer.contactPerson ? (
            <Text style={styles.contactPerson} numberOfLines={1}>
              <Ionicons name="person-outline" size={11} color={colors.textMuted} /> {customer.contactPerson}
            </Text>
          ) : null}
        </View>

        <View style={styles.balance}>
          <Pill
            label={hasPending ? formatRs(pendingTotal) : 'Clear'}
            tone={hasPending ? 'danger' : 'success'}
            icon={hasPending ? 'alert-circle' : 'checkmark-circle'}
          />
          <Text style={styles.balanceCaption}>{hasPending ? 'pending' : 'no dues'}</Text>
        </View>
      </View>

      <View style={styles.bottom}>
        <View style={styles.phoneBlock}>
          <Ionicons name="call-outline" size={13} color={colors.textMuted} />
          <Text style={styles.phone} numberOfLines={1}>
            {phone ?? 'No phone on file'}
          </Text>
          {!customer.isActive ? <Pill label="Inactive" tone="neutral" uppercase /> : null}
          {customer.customerType ? <Pill label={customer.customerType} tone="info" /> : null}
        </View>

        {phone ? (
          <View style={styles.contactButtons}>
            <ContactButton
              icon="call"
              label={`Call ${customer.name}`}
              tint={colors.primary}
              background={colors.primarySoft}
              onPress={call}
            />
            <ContactButton
              icon="logo-whatsapp"
              label={`WhatsApp ${customer.name}`}
              tint={colors.success}
              background={colors.successSoft}
              onPress={whatsapp}
            />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...cardShadow,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  identity: { flex: 1, gap: 2 },
  shop: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: typography.cardMeta,
  contactPerson: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  balance: { alignItems: 'flex-end', gap: 2 },
  balanceCaption: { fontSize: 10, color: colors.textMuted },

  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  phoneBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  phone: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  contactButtons: { flexDirection: 'row', gap: spacing.sm },
  contactButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
});
