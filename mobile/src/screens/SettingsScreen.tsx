import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DetailCard } from '@/components/DetailCard';
import { Banner } from '@/components/form/Banner';
import { Button } from '@/components/form/Button';
import { Field } from '@/components/form/Field';
import { FormScreen } from '@/components/form/FormScreen';
import { updateCompanyProfile } from '@/lib/api/auth';
import { useAuth } from '@/lib/auth/AuthContext';
import { cardShadow, colors, radius, spacing } from '@/lib/theme';

const COMPANY_NAME_MAX = 150;
const TAGLINE_MAX = 150;

// Application-level settings. Deliberately minimal, as on the web: the one
// thing that genuinely is application-level is what the business is called.
// No business data belongs here.
export function SettingsScreen() {
  const { user, refreshUser } = useAuth();

  const [companyName, setCompanyName] = useState(user?.companyName ?? '');
  const [tagline, setTagline] = useState(user?.tagline ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Re-seeded if the session's values change underneath.
  const sessionName = user?.companyName ?? '';
  const sessionTagline = user?.tagline ?? '';
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompanyName(sessionName);
    setTagline(sessionTagline);
  }, [sessionName, sessionTagline]);

  const trimmed = companyName.trim();
  const trimmedTagline = tagline.trim();
  const isUnchanged = trimmed === sessionName && trimmedTagline === sessionTagline;

  async function handleSave() {
    setError(null);
    setSuccess(null);

    if (!trimmed) {
      setError('Enter a company name - it appears on the dashboard and on every order receipt.');
      return;
    }

    setIsSaving(true);
    try {
      await updateCompanyProfile({ companyName: trimmed, tagline: trimmedTagline || null });
      // Refreshes the session so every screen picks the new name up at once.
      await refreshUser();
      setSuccess('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FormScreen>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Company</Text>
        {error ? <Banner kind="error">{error}</Banner> : null}
        {success ? (
          <Banner kind="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Banner>
        ) : null}

        <Field
          label="Company name"
          value={companyName}
          onChangeText={(text) => {
            setCompanyName(text);
            setSuccess(null);
          }}
          maxLength={COMPANY_NAME_MAX}
          placeholder="e.g. Al-Noor Distributors"
          editable={!isSaving}
          autoCapitalize="words"
        />
        <Field
          label="Tagline"
          value={tagline}
          onChangeText={(text) => {
            setTagline(text);
            setSuccess(null);
          }}
          maxLength={TAGLINE_MAX}
          placeholder="e.g. Medicine Distribution"
          editable={!isSaving}
          hint="Printed under the company name on receipts. Leave blank for the default."
        />
        <Text style={styles.note}>
          The name is shown on the dashboard and, with the tagline, printed at the top of every order receipt. Both
          apply to your account only.
        </Text>
        <Text style={styles.note}>
          Receipts are generated from the current name each time they are exported, so re-exporting an older order
          will show the new name. The orders themselves - their products, prices, discounts and totals - are never
          affected.
        </Text>
        <Button
          title="Save Company Details"
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving || isUnchanged || !trimmed}
          style={styles.save}
        />
      </View>

      <DetailCard
        title="Signed in as"
        items={[
          { label: 'Name', value: user?.name },
          { label: 'Username', value: user?.username },
          { label: 'Contact', value: user?.phone },
          { label: 'Status', value: user?.isActive ? 'Active' : 'Inactive', highlight: user?.isActive },
        ]}
      />
      <Text style={styles.note}>
        These details are set when an account is created and aren&apos;t editable here. Your customers, products,
        orders and targets are private to your account - no other user can see them.
      </Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.sm },
  save: { marginTop: spacing.md },
});
