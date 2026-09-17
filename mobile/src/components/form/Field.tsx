import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing } from '@/lib/theme';

type Props = TextInputProps & {
  label: string;
  required?: boolean;
  hint?: string;
  // Rendered inside the input on the right - "%" on a discount box, say.
  suffix?: string;
};

// A labelled text input, the building block of every form. Numeric fields
// pass keyboardType="decimal-pad" / "number-pad"; values stay strings in
// state so a box can be empty mid-edit, exactly as on the web.
export function Field({ label, required, hint, suffix, style, editable = true, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={[styles.inputRow, !editable && styles.inputDisabled]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textMuted}
          editable={editable}
          {...rest}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  required: { color: colors.danger },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md + 2,
  },
  inputDisabled: { backgroundColor: colors.surfaceMuted },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 12 },
  suffix: { color: colors.textMuted, fontSize: 15, marginLeft: spacing.sm },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});
