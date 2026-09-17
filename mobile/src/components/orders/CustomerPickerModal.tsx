import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { PressableScale } from '../PressableScale';
import { listCustomers, type Customer } from '@/lib/api/customers';
import { colors, radius, spacing } from '@/lib/theme';

const RESULT_LIMIT = 20;

type Props = { visible: boolean; onClose: () => void; onSelect: (customer: Customer) => void };

// Step 1 of the order flow: pick the customer. A searchable full-screen
// list rather than a dropdown - a distributor's customer list is far too
// long to scroll. Only active customers are offered, because the API
// refuses to book an order for an inactive one.
export function CustomerPickerModal({ visible, onClose, onSelect }: Props) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  // Guards against a slow earlier response landing after a newer one.
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const fetchCustomers = useCallback(async () => {
    const requestId = ++requestRef.current;
    setStatus('loading');
    setError(null);
    try {
      const data = await listCustomers({ search: search || undefined, isActive: true, limit: RESULT_LIMIT, page: 1 });
      if (requestRef.current !== requestId) return;
      setResults(data.customers);
      setStatus('ready');
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [search]);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCustomers();
  }, [visible, fetchCustomers]);

  function select(customer: Customer) {
    onSelect(customer);
    setInput('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Customer</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search customers by name or code"
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {input ? (
            <Pressable onPress={() => setInput('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : status === 'error' ? (
          <ErrorState message={`Could not load customers: ${error}`} onRetry={fetchCustomers} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <EmptyState
                icon="people-outline"
                title={search ? `No active customer matches “${search}”` : 'No active customers yet'}
              />
            }
            renderItem={({ item }) => (
              <PressableScale style={styles.row} onPress={() => select(item)}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowMeta}>
                    {item.code}
                    {item.cityArea ? ` · ${item.cityArea}` : ''}
                    {item.phone ? ` · ${item.phone}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </PressableScale>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted },
});
