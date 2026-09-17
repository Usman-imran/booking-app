import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PressableScale } from '@/components/PressableScale';
import { listCompanies, type CompanySummary } from '@/lib/api/companies';
import { cardShadow, colors, initialsOf, radius, spacing } from '@/lib/theme';
import { useRevalidateOnFocus } from '@/lib/usePaginatedList';

// Browse products by manufacturer. Mirrors the web's CompanyList: the list is
// derived from active products, and filtered locally because it is far too
// short to be worth a request per keystroke.
export function CompaniesScreen() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    setError(null);
    if (mode === 'initial') setStatus('loading');
    if (mode === 'refresh') setIsRefreshing(true);
    try {
      const data = await listCompanies();
      setCompanies(data.companies);
      setTotalProducts(data.totalProducts);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('initial');
  }, [load]);
  // Catches up after a product is added or edited on a pushed screen.
  useRevalidateOnFocus(useCallback(() => load('silent'), [load]));

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((entry) => entry.company.toLowerCase().includes(term));
  }, [companies, search]);

  return (
    <View style={styles.flex}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search companies"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : status === 'error' ? (
        <ErrorState message={`Could not load companies: ${error}`} onRetry={() => load('initial')} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.company}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            companies.length > 0 ? (
              <Text style={styles.count}>
                {companies.length} compan{companies.length === 1 ? 'y' : 'ies'} · {totalProducts} active product
                {totalProducts === 1 ? '' : 's'}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            companies.length === 0 ? (
              <EmptyState
                icon="business-outline"
                title="No companies yet"
                message="A company appears here as soon as an active product is assigned to it - set one on a product, or fill in the Company column when importing."
              />
            ) : (
              <EmptyState icon="search-outline" title={`No company matches “${search.trim()}”`} />
            )
          }
          renderItem={({ item }) => (
            <PressableScale
              style={styles.row}
              onPress={() => router.push(`/companies/${encodeURIComponent(item.company)}`)}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{initialsOf(item.company)}</Text>
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.company}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.productCount} active product{item.productCount === 1 ? '' : 's'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </PressableScale>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  count: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md + 2,
    marginBottom: spacing.sm + 2,
    ...cardShadow,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted },
});
