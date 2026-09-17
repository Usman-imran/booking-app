import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { DetailCard } from '@/components/DetailCard';
import { ErrorState } from '@/components/ErrorState';
import { Banner } from '@/components/form/Banner';
import { Button } from '@/components/form/Button';
import { deactivateCustomer, getCustomer, updateCustomer, type Customer } from '@/lib/api/customers';
import { colors, formatDate, spacing } from '@/lib/theme';

// Mirrors the web's CustomerDetails: every field, Edit, and the
// deactivate / reactivate toggle. Reloads whenever the screen regains focus
// so changes made on the Edit screen show as soon as it is dismissed.
export function CustomerDetailsScreen({ id }: { id: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getCustomer(id);
      setCustomer(data.customer);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function refresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  async function toggleActive() {
    if (!customer) return;
    setIsMutating(true);
    setActionError(null);
    try {
      if (customer.isActive) {
        await deactivateCustomer(id);
      } else {
        await updateCustomer(id, { isActive: true });
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsMutating(false);
    }
  }

  function confirmToggle() {
    if (!customer) return;
    Alert.alert(
      customer.isActive ? 'Deactivate customer?' : 'Reactivate customer?',
      customer.isActive
        ? `${customer.name} will be marked inactive and won't be selectable for new orders. You can reactivate it later.`
        : `${customer.name} will be marked active again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: customer.isActive ? 'Deactivate' : 'Reactivate',
          style: customer.isActive ? 'destructive' : 'default',
          onPress: toggleActive,
        },
      ]
    );
  }

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (status === 'error' || !customer) {
    return <ErrorState message={`Could not load customer: ${error}`} onRetry={load} />;
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />}>
      <View style={styles.hero}>
        <Avatar name={customer.name} size={72} />
        <Text style={styles.name}>{customer.name}</Text>
        <Text style={styles.code}>{customer.code}</Text>
        <Text style={[styles.statusPill, customer.isActive ? styles.statusActive : styles.statusInactive]}>
          {customer.isActive ? 'Active' : 'Inactive'}
        </Text>
      </View>

      {actionError ? <Banner kind="error">{actionError}</Banner> : null}

      <DetailCard
        title="Contact"
        items={[
          { label: 'Contact Person', value: customer.contactPerson },
          { label: 'Phone', value: customer.phone },
          { label: 'Alternate Phone', value: customer.alternatePhone },
          { label: 'City / Area', value: customer.cityArea },
          { label: 'Address', value: customer.address },
        ]}
      />
      <DetailCard
        title="Details"
        items={[
          { label: 'Customer Type', value: customer.customerType },
          { label: 'Added', value: formatDate(customer.createdAt) },
          { label: 'Last updated', value: formatDate(customer.updatedAt) },
        ]}
      />

      <View style={styles.actions}>
        <Button
          title="Edit Customer"
          icon="create-outline"
          onPress={() => router.push(`/customers/${id}/edit`)}
          disabled={isMutating}
        />
        <Button
          title={customer.isActive ? 'Deactivate' : 'Reactivate'}
          icon={customer.isActive ? 'person-remove-outline' : 'person-add-outline'}
          variant={customer.isActive ? 'danger' : 'secondary'}
          onPress={confirmToggle}
          loading={isMutating}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  hero: { alignItems: 'center', gap: 4, paddingBottom: spacing.xl },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  code: { fontSize: 14, color: colors.textMuted },
  statusPill: {
    marginTop: spacing.sm,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  statusActive: { color: colors.success, backgroundColor: colors.successSoft },
  statusInactive: { color: colors.danger, backgroundColor: colors.dangerSoft },
  actions: { gap: spacing.md, marginTop: spacing.sm },
});
