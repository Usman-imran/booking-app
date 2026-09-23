import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PressableScale } from '@/components/PressableScale';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SearchField } from '@/components/ui/SearchField';
import { listCustomerAreas, listCustomers, type Customer } from '@/lib/api/customers';
import { searchCachedCustomers, withOfflineFallback } from '@/lib/offline/offlineCache';
import { colors, initialsOf, radius, spacing } from '@/lib/theme';
import { usePaginatedList, useRevalidateOnFocus } from '@/lib/usePaginatedList';

type StatusFilter = 'all' | 'active' | 'inactive';

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

// A phone number as WhatsApp wants it: digits only, with the country code.
// Local Pakistani numbers (03xx...) get 92 in place of the leading 0.
function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `92${digits.slice(1)}`;
  return digits;
}

async function openUrl(url: string, fallback: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open', fallback);
  }
}

function Chip({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}>
      {icon ? <Ionicons name={icon} size={13} color={active ? '#fff' : colors.textMuted} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// One customer as a contact card: the shop, who to ask for, where it is,
// and one-tap Call / WhatsApp when there's a number.
function CustomerCard({ customer }: { customer: Customer }) {
  const phone = customer.phone?.trim() || customer.alternatePhone?.trim() || null;

  return (
    <PressableScale style={styles.card} onPress={() => router.push(`/customers/${customer.id}`)}>
      <View style={styles.cardTop}>
        <View style={[styles.monogram, !customer.isActive && styles.monogramInactive]}>
          <Text style={[styles.monogramText, !customer.isActive && { color: colors.textMuted }]}>
            {initialsOf(customer.name)}
          </Text>
        </View>
        <View style={styles.cardMain}>
          <Text style={styles.shop} numberOfLines={1}>
            {customer.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {customer.code}
            {customer.contactPerson ? ` · ${customer.contactPerson}` : ''}
          </Text>
        </View>
        {phone ? (
          <View style={styles.contactButtons}>
            <Pressable
              onPress={() => openUrl(`tel:${phone}`, `Call ${phone} from your phone app.`)}
              hitSlop={6}
              style={({ pressed }) => [styles.roundButton, styles.callButton, pressed && { opacity: 0.7 }]}
              accessibilityLabel={`Call ${customer.name}`}>
              <Ionicons name="call" size={16} color={colors.primary} />
            </Pressable>
            <Pressable
              onPress={() =>
                openUrl(`https://wa.me/${whatsappNumber(phone)}`, `Message ${phone} on WhatsApp.`)
              }
              hitSlop={6}
              style={({ pressed }) => [styles.roundButton, styles.waButton, pressed && { opacity: 0.7 }]}
              accessibilityLabel={`WhatsApp ${customer.name}`}>
              <Ionicons name="logo-whatsapp" size={17} color="#128C4B" />
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.cardFoot}>
        {customer.cityArea ? (
          <View style={styles.footItem}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={styles.footText} numberOfLines={1}>
              {customer.cityArea}
            </Text>
          </View>
        ) : null}
        {phone ? (
          <View style={styles.footItem}>
            <Ionicons name="call-outline" size={13} color={colors.textMuted} />
            <Text style={styles.footText} numberOfLines={1}>
              {phone}
            </Text>
          </View>
        ) : (
          <Text style={[styles.footText, styles.noPhone]}>No phone number</Text>
        )}
        <View style={styles.badges}>
          {customer.customerType ? <Text style={styles.typeBadge}>{customer.customerType}</Text> : null}
          <Text style={[styles.statusBadge, customer.isActive ? styles.statusActive : styles.statusInactive]}>
            {customer.isActive ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

// The Customers tab: search and filters pinned at the top, contact cards
// below with pull-to-refresh and infinite scroll, and Add Customer as a
// floating button. Offline, active customers come from the copy saved on
// the device. Reloads on focus so an edit on a pushed screen shows at once.
export function CustomersScreen() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [area, setArea] = useState<string | null>(null);
  const [areas, setAreas] = useState<{ area: string; customers: number }[]>([]);

  // Areas for the chips. Quiet on failure: offline, there are just no area
  // chips.
  const loadAreas = useCallback(() => {
    listCustomerAreas()
      .then((data) => setAreas(data.areas))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadAreas();
  }, [loadAreas]);

  const fetchPage = useCallback(
    async (page: number, search: string) => {
      const isActive = status === 'all' ? undefined : status === 'active';
      const { data } = await withOfflineFallback(
        () =>
          listCustomers({ page, limit: 25, search: search || undefined, isActive, cityArea: area ?? undefined }).then(
            (result) => ({ items: result.customers, pagination: result.pagination })
          ),
        () => {
          // The device only keeps active customers, and only one "page".
          if (status === 'inactive' || page > 1) return null;
          const needle = area?.trim().toLowerCase();
          const rows = (searchCachedCustomers({ search, limit: 500 }) ?? []).filter(
            (customer) => !needle || customer.cityArea?.trim().toLowerCase() === needle
          );
          return { items: rows, pagination: { page: 1, limit: rows.length, total: rows.length, totalPages: 1 } };
        }
      );
      return data;
    },
    [status, area]
  );

  const list = usePaginatedList(fetchPage);
  const { revalidate } = list;
  useRevalidateOnFocus(
    useCallback(() => {
      revalidate();
      loadAreas();
    }, [revalidate, loadAreas])
  );

  const filtered = status !== 'all' || area !== null;
  const total = list.pagination?.total;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Customers" eyebrow={total !== undefined ? `${total} ${filtered ? 'shown' : 'customers'}` : null} />

      {/* Pinned: search and filters stay put while the list scrolls. */}
      <View style={styles.pinned}>
        <SearchField
          value={list.search}
          onChangeText={list.setSearch}
          placeholder="Search shop name or code"
          style={styles.search}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsRow}>
          {STATUS_CHIPS.map((chip) => (
            <Chip key={chip.key} label={chip.label} active={status === chip.key} onPress={() => setStatus(chip.key)} />
          ))}
          {areas.length > 0 ? <View style={styles.chipDivider} /> : null}
          {areas.map((item) => (
            <Chip
              key={item.area}
              icon="location-outline"
              label={`${item.area} · ${item.customers}`}
              active={area?.toLowerCase() === item.area.toLowerCase()}
              onPress={() => setArea((current) => (current?.toLowerCase() === item.area.toLowerCase() ? null : item.area))}
            />
          ))}
        </ScrollView>
      </View>

      {list.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : list.status === 'error' ? (
        <ErrorState message={`Could not load customers: ${list.error}`} onRetry={list.retry} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <CustomerCard customer={item} />}
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={list.search || filtered ? 'No matching customers' : 'No customers yet'}
              message={
                list.search || filtered ? 'Try a different search or filter.' : 'Add your first customer with the button below.'
              }
            />
          }
          ListFooterComponent={
            list.isLoadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
        />
      )}

      <PressableScale style={styles.fab} onPress={() => router.push('/customers/new')} accessibilityLabel="Add customer">
        <Ionicons name="person-add" size={18} color="#fff" />
        <Text style={styles.fabText}>Add customer</Text>
      </PressableScale>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pinned: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  search: { marginHorizontal: spacing.xl },
  chipsRow: { flexGrow: 0 },
  chips: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  chipDivider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Room at the bottom so the last card clears the floating button.
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 96, flexGrow: 1 },
  footer: { paddingVertical: spacing.lg },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 2,
    marginBottom: spacing.sm + 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  monogram: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramInactive: { backgroundColor: colors.surfaceMuted },
  monogramText: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  cardMain: { flex: 1, gap: 2 },
  shop: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12.5, color: colors.textMuted },
  contactButtons: { flexDirection: 'row', gap: spacing.sm },
  roundButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  callButton: { backgroundColor: colors.primarySoft },
  waButton: { backgroundColor: '#E3F7EA' },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '45%' },
  footText: { fontSize: 12, color: colors.textSecondary },
  noPhone: { color: colors.textMuted, fontStyle: 'italic' },
  badges: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  typeBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.primaryDark,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  statusBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  statusActive: { color: colors.success, backgroundColor: colors.successSoft },
  statusInactive: { color: colors.textMuted, backgroundColor: colors.surfaceMuted },

  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg + 2,
    height: 50,
    shadowColor: '#1668b8',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
});
