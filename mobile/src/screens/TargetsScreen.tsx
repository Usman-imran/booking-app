import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { Banner } from '@/components/form/Banner';
import { Button } from '@/components/form/Button';
import { Field } from '@/components/form/Field';
import { FormScreen } from '@/components/form/FormScreen';
import { OptionPicker } from '@/components/form/OptionPicker';
import { listProductCompanies } from '@/lib/api/products';
import { deleteTarget, getTargets, setTarget, type MonthTargets, type TargetProgress, type TargetStatus } from '@/lib/api/targets';
import { cardShadow, colors, formatMoney, radius, spacing } from '@/lib/theme';
import { useRevalidateOnFocus } from '@/lib/usePaginatedList';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Status is decided by the backend so this screen and the Dashboard can't
// label the same month differently; this only gives each value a look.
const STATUS_LOOK: Record<TargetStatus, { label: string; fg: string; bg: string }> = {
  achieved: { label: 'Achieved', fg: colors.success, bg: colors.successSoft },
  'in-progress': { label: 'In Progress', fg: colors.primary, bg: colors.primarySoft },
  'not-started': { label: 'Not Started', fg: colors.textMuted, bg: colors.surfaceMuted },
  'no-target': { label: 'No Target Set', fg: colors.warning, bg: colors.warningSoft },
};

const OVERALL = '__overall__';

// A few years either side of now: targets are set just ahead of a month and
// reviewed for a while afterwards.
function yearOptions() {
  const now = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, index) => ({ value: now - 3 + index, label: String(now - 3 + index) }));
}

function formatPercent(percent: number | null) {
  // A zero target makes the percentage undefined - the API sends null.
  return percent === null ? '—' : `${formatMoney(percent)}%`;
}

function TargetCard({
  row,
  onEdit,
  onRemove,
  disabled,
}: {
  row: TargetProgress;
  onEdit: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const look = STATUS_LOOK[row.status] ?? STATUS_LOOK['not-started'];
  const isOverall = row.scope === 'overall';
  const percent = row.achievementPercent === null ? 0 : Math.min(Math.max(row.achievementPercent, 0), 100);

  return (
    <View style={[styles.card, isOverall && styles.cardPrimary]}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, isOverall && styles.onPrimary]} numberOfLines={1}>
          {row.company ?? 'Overall'}
        </Text>
        <Text style={[styles.badge, { color: look.fg, backgroundColor: look.bg }]}>{look.label}</Text>
      </View>

      <Text style={[styles.figure, isOverall && styles.onPrimary]}>{formatPercent(row.achievementPercent)}</Text>
      <View style={[styles.track, isOverall && styles.trackOnPrimary]}>
        <View style={[styles.fill, isOverall && styles.fillOnPrimary, { width: `${percent}%` }]} />
      </View>

      <Row label="Target" value={row.targetAmount > 0 ? formatMoney(row.targetAmount) : '—'} onPrimary={isOverall} />
      <Row label="Achieved" value={formatMoney(row.achieved)} onPrimary={isOverall} />
      <Row
        label={row.remaining < 0 ? 'Exceeded by' : 'Remaining'}
        value={formatMoney(Math.abs(row.remaining))}
        onPrimary={isOverall}
      />
      <Row label="Valid Orders" value={String(row.orders)} onPrimary={isOverall} />

      <View style={styles.cardActions}>
        <Pressable onPress={onEdit} disabled={disabled} hitSlop={6} style={styles.cardAction}>
          <Ionicons name="create-outline" size={16} color={isOverall ? '#fff' : colors.primary} />
          <Text style={[styles.cardActionText, isOverall && styles.onPrimary]}>{row.id ? 'Edit' : 'Set Target'}</Text>
        </Pressable>
        {row.id ? (
          <Pressable onPress={onRemove} disabled={disabled} hitSlop={6} style={styles.cardAction}>
            <Ionicons name="trash-outline" size={16} color={isOverall ? '#ffd6d3' : colors.danger} />
            <Text style={[styles.cardActionText, { color: isOverall ? '#ffd6d3' : colors.danger }]}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Row({ label, value, onPrimary }: { label: string; value: string; onPrimary: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, onPrimary && styles.onPrimaryMuted]}>{label}</Text>
      <Text style={[styles.rowValue, onPrimary && styles.onPrimary]}>{value}</Text>
    </View>
  );
}

// Monthly Targets: a month has one overall target and optionally one per
// manufacturer. Every figure - achieved, remaining, achievement %, status -
// is computed by the backend from the same valid-sales definition Sales
// Reports use. Mirrors the web's Targets page.
export function TargetsScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState<'all' | 'overall'>('all');

  const [data, setData] = useState<MonthTargets | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [companies, setCompanies] = useState<string[]>([]);

  const [formCompany, setFormCompany] = useState<string>(OVERALL);
  const [formAmount, setFormAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
      setError(null);
      if (mode === 'initial') setStatus('loading');
      if (mode === 'refresh') setIsRefreshing(true);
      try {
        setData(await getTargets({ year, month, scope: view }));
        setStatus('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        setStatus('error');
      } finally {
        setIsRefreshing(false);
      }
    },
    [year, month, view]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('initial');
  }, [load]);
  // Achieved figures move whenever an order is booked elsewhere in the app.
  useRevalidateOnFocus(useCallback(() => load('silent'), [load]));

  // Loaded once for the scope picker. A failure here costs only the
  // suggestions, so it must not take the screen down.
  useEffect(() => {
    let cancelled = false;
    listProductCompanies()
      .then((result) => {
        if (!cancelled) setCompanies(result.companies);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setFormError(null);
    setSuccess(null);

    const amount = Number(formAmount);
    if (formAmount.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      setFormError('Enter a target amount of zero or more.');
      return;
    }

    setIsSaving(true);
    try {
      const company = formCompany === OVERALL ? null : formCompany;
      await setTarget({ year, month, company, targetAmount: amount });
      setSuccess(`${company ? `${company} target` : 'Overall target'} for ${MONTHS[month - 1]} ${year} set to ${formatMoney(amount)}.`);
      setFormAmount('');
      await load('silent');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  function confirmRemove(row: TargetProgress) {
    if (!row.id) return;
    Alert.alert(
      'Remove this target?',
      `The ${row.company ?? 'overall'} target of ${formatMoney(row.targetAmount)} for ${MONTHS[month - 1]} ${year} will be removed. Orders and sales figures are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Target',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            setFormError(null);
            try {
              await deleteTarget(row.id!);
              setSuccess('Target removed.');
              await load('silent');
            } catch (err) {
              setFormError(err instanceof Error ? err.message : 'Something went wrong.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  }

  // Prefills the form when editing an existing row, so "Edit" doesn't mean
  // retyping the month and company.
  function editRow(row: TargetProgress) {
    setFormCompany(row.company ?? OVERALL);
    setFormAmount(row.targetAmount ? String(row.targetAmount) : '');
    setSuccess(null);
    setFormError(null);
  }

  const rows = data ? (view === 'overall' ? [data.overall] : [data.overall, ...data.companies]) : [];
  const isBusy = isSaving || isDeleting;

  // A company that sold this month without a target is offered too, so it
  // can be given one straight from this screen.
  const scopeOptions = [
    { value: OVERALL, label: 'Overall (all companies)' },
    ...Array.from(new Set([...companies, ...(data?.companies.map((row) => row.company ?? '') ?? [])]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name })),
  ];

  return (
    <FormScreen
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />}>
      <View style={styles.filters}>
        <OptionPicker
          label="Month"
          value={month}
          options={MONTHS.map((name, index) => ({ value: index + 1, label: name }))}
          onChange={setMonth}
        />
        <OptionPicker label="Year" value={year} options={yearOptions()} onChange={setYear} />
      </View>
      <View style={styles.viewToggle}>
        {(['all', 'overall'] as const).map((option) => {
          const active = option === view;
          return (
            <Pressable
              key={option}
              onPress={() => setView(option)}
              style={({ pressed }) => [styles.toggle, active && styles.toggleActive, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                {option === 'all' ? 'Overall + company-wise' : 'Overall only'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {success ? (
        <Banner kind="success" onDismiss={() => setSuccess(null)}>
          {success}
        </Banner>
      ) : null}

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>
          Set a target for {MONTHS[month - 1]} {year}
        </Text>
        {formError ? <Banner kind="error">{formError}</Banner> : null}
        <View style={styles.formField}>
          <OptionPicker label="Scope" value={formCompany} options={scopeOptions} onChange={setFormCompany} disabled={isBusy} />
        </View>
        <Field
          label="Target Amount"
          value={formAmount}
          onChangeText={setFormAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          editable={!isBusy}
        />
        <Button title="Save Target" icon="flag-outline" onPress={handleSave} loading={isSaving} disabled={isBusy} />
        <Text style={styles.note}>
          Saving replaces the target for the selected month and scope. Company targets are measured against that
          manufacturer&apos;s products only; the overall target covers the whole month.
        </Text>
      </View>

      {status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : status === 'error' ? (
        <ErrorState message={`Could not load targets: ${error}`} onRetry={() => load('initial')} />
      ) : (
        <>
          {rows.map((row) => (
            <TargetCard
              key={row.company ?? 'overall'}
              row={row}
              onEdit={() => editRow(row)}
              onRemove={() => confirmRemove(row)}
              disabled={isBusy}
            />
          ))}
          <Text style={styles.note}>
            Achieved counts only submitted orders - drafts and cancelled orders are excluded. Bonus quantities are free
            and add nothing; line discounts are already deducted. These are the same figures Sales Reports shows for
            this month.
          </Text>
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.lg,
  },
  toggle: { flex: 1, paddingVertical: 8, borderRadius: radius.sm + 1, alignItems: 'center' },
  toggleActive: { backgroundColor: colors.surface, ...cardShadow },
  toggleText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  toggleTextActive: { color: colors.text },
  center: { alignItems: 'center', paddingVertical: spacing.xxl },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  formTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  formField: { marginBottom: spacing.lg },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  cardPrimary: { backgroundColor: colors.primary },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  figure: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginVertical: spacing.md },
  trackOnPrimary: { backgroundColor: 'rgba(255,255,255,0.25)' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  fillOnPrimary: { backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 13, color: colors.textMuted },
  rowValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  onPrimary: { color: '#fff' },
  onPrimaryMuted: { color: '#dceaff' },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.12)',
  },
  cardAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardActionText: { fontSize: 13, fontWeight: '600', color: colors.primary },
});
