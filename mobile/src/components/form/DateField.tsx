import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/lib/theme';

// Local calendar date <-> the YYYY-MM-DD strings the API takes. Built from
// local components so a date never shifts by a day across the UTC boundary.
export function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

function formatDisplay(value: string) {
  return fromIsoDate(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

type Props = {
  label: string;
  // '' when unset.
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  clearable?: boolean;
};

// A tappable date field backed by the platform's own picker: Android opens
// the system dialog, iOS shows an inline calendar in a sheet.
export function DateField({ label, value, onChange, placeholder = 'Any', minimumDate, maximumDate, clearable = true }: Props) {
  const [iosOpen, setIosOpen] = useState(false);
  const current = value ? fromIsoDate(value) : new Date();

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) onChange(toIsoDate(date));
        },
      });
      return;
    }
    setIosOpen(true);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <Pressable style={styles.input} onPress={open}>
          <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.value, !value && styles.placeholder]}>{value ? formatDisplay(value) : placeholder}</Text>
        </Pressable>
        {clearable && value ? (
          <Pressable onPress={() => onChange('')} hitSlop={8} style={styles.clear}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setIosOpen(false)} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setIosOpen(false)} hitSlop={8}>
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={current}
              mode="date"
              display="inline"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              accentColor={colors.primary}
              onChange={(_event, date) => {
                if (date) onChange(toIsoDate(date));
              }}
            />
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: '100%' },
  value: { fontSize: 14, color: colors.text, fontWeight: '500' },
  placeholder: { color: colors.textMuted, fontWeight: '400' },
  clear: { marginLeft: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  done: { fontSize: 16, fontWeight: '600', color: colors.primary },
});
