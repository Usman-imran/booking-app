import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Field } from './Field';
import { FormScreen } from './FormScreen';
import type { CustomerInput } from '@/lib/api/customers';
import { colors, spacing } from '@/lib/theme';

// Same character limits the API enforces (customers.routes.js), so a too-long
// value is refused as it is typed rather than on submit.
const LIMITS: Partial<Record<keyof CustomerInput, number>> = {
  name: 150,
  code: 50,
  contactPerson: 150,
  phone: 20,
  alternatePhone: 20,
  cityArea: 100,
  customerType: 50,
};

export const EMPTY_CUSTOMER_FORM: CustomerInput = {
  name: '',
  code: '',
  contactPerson: '',
  phone: '',
  alternatePhone: '',
  address: '',
  cityArea: '',
  customerType: '',
};

type Props = {
  initialValues?: Partial<CustomerInput>;
  submitLabel: string;
  onSubmit: (values: CustomerInput) => Promise<void>;
  onCancel: () => void;
};

type FieldErrors = Partial<Record<keyof CustomerInput, boolean>>;

// The mobile counterpart of the web's CustomerForm, shared by Add and Edit:
// the same fields, the same "name and code are required" rule, the same
// body. Blank optional fields are sent as '' and stored as null. A missing
// required field is flagged with a red border rather than a banner.
export function CustomerForm({ initialValues, submitLabel, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<CustomerInput>({ ...EMPTY_CUSTOMER_FORM, ...initialValues });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function set(field: keyof CustomerInput) {
    return (text: string) => {
      setErrors((current) => (current[field] ? { ...current, [field]: false } : current));
      setValues((current) => ({ ...current, [field]: text }));
    };
  }

  function validate(): FieldErrors {
    const problems: FieldErrors = {};
    if (!values.name.trim()) problems.name = true;
    if (!values.code.trim()) problems.code = true;
    return problems;
  }

  async function handleSubmit() {
    const problems = validate();
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      Alert.alert('Could not save customer', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FormScreen>
      <Field
        label="Customer Name"
        required
        value={values.name}
        onChangeText={set('name')}
        error={errors.name}
        maxLength={LIMITS.name}
        autoCapitalize="words"
      />
      <Field
        label="Customer Code"
        required
        value={values.code}
        onChangeText={set('code')}
        error={errors.code}
        maxLength={LIMITS.code}
        autoCapitalize="characters"
        autoCorrect={false}
        hint="A short unique reference, e.g. CUST-001."
      />
      <Field
        label="Contact Person"
        value={values.contactPerson}
        onChangeText={set('contactPerson')}
        maxLength={LIMITS.contactPerson}
        autoCapitalize="words"
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Field
            label="Phone"
            value={values.phone}
            onChangeText={set('phone')}
            maxLength={LIMITS.phone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />
        </View>
        <View style={styles.half}>
          <Field
            label="Alternate Phone"
            value={values.alternatePhone}
            onChangeText={set('alternatePhone')}
            maxLength={LIMITS.alternatePhone}
            keyboardType="phone-pad"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Area" value={values.cityArea} onChangeText={set('cityArea')} maxLength={LIMITS.cityArea} />
        </View>
        <View style={styles.half}>
          <Field
            label="Customer Type"
            value={values.customerType}
            onChangeText={set('customerType')}
            maxLength={LIMITS.customerType}
            placeholder="e.g. Retailer"
          />
        </View>
      </View>

      <Field
        label="Address"
        value={values.address}
        onChangeText={set('address')}
        multiline
        numberOfLines={3}
        style={styles.multiline}
      />

      <Text style={styles.required}>* Required</Text>

      <View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={isSubmitting} style={styles.flex1} />
        <Button title={submitLabel} onPress={handleSubmit} loading={isSubmitting} style={styles.flex1} />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  required: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md },
});
