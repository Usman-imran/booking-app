import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Banner } from './Banner';
import { Button } from './Button';
import { Field } from './Field';
import { FormScreen } from './FormScreen';
import { ImagePickerField, type PickedImage } from './ImagePickerField';
import type { ProductInput } from '@/lib/api/products';
import { colors, spacing } from '@/lib/theme';

// Same character limits the API enforces (products.routes.js).
const LIMITS = { name: 200, code: 50, company: 150, packing: 100, unit: 50 };

export type ProductFormValues = {
  name: string;
  code: string;
  company: string;
  packing: string;
  unit: string;
  mrp: string;
  salePrice: string;
  discount: string;
  schemeEnabled: boolean;
  schemePurchaseQty: string;
  schemeBonusQty: string;
};

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  code: '',
  company: '',
  packing: '',
  unit: '',
  mrp: '',
  salePrice: '',
  discount: '0',
  schemeEnabled: false,
  schemePurchaseQty: '',
  schemeBonusQty: '',
};

function toNumberOrNull(value: string): number | null {
  if (value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

type Props = {
  initialValues?: Partial<ProductFormValues>;
  submitLabel: string;
  onSubmit: (payload: ProductInput) => Promise<void>;
  onCancel: () => void;
  // The photo picker only makes sense when creating; the API has no image
  // field yet, so it is a local preview and is left off the edit form.
  showPhotoPicker?: boolean;
};

// The mobile counterpart of the web's ProductForm, shared by Add and Edit:
// same fields, validation and payload. Numeric values stay strings in state
// so a box can be cleared mid-edit; they are converted once, on submit.
export function ProductForm({ initialValues, submitLabel, onSubmit, onCancel, showPhotoPicker }: Props) {
  const [values, setValues] = useState<ProductFormValues>({ ...EMPTY_PRODUCT_FORM, ...initialValues });
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function set<K extends keyof ProductFormValues>(field: K) {
    return (value: ProductFormValues[K]) => {
      setError(null);
      setValues((current) => ({ ...current, [field]: value }));
    };
  }

  function validate(): string | null {
    if (!values.name.trim() || !values.code.trim()) return 'Product name and code are required.';

    const mrp = toNumberOrNull(values.mrp);
    if (mrp === null || mrp < 0) return 'MRP must be a valid non-negative number.';

    const salePrice = toNumberOrNull(values.salePrice);
    if (salePrice === null || salePrice < 0) return 'Sale Price must be a valid non-negative number.';

    const discount = values.discount === '' ? 0 : toNumberOrNull(values.discount);
    if (discount === null || discount < 0 || discount > 100) return 'Discount must be a number between 0 and 100.';

    if (values.schemeEnabled) {
      const purchaseQty = toNumberOrNull(values.schemePurchaseQty);
      if (purchaseQty === null || !Number.isInteger(purchaseQty) || purchaseQty <= 0) {
        return 'Purchase Quantity must be a positive whole number when the bonus scheme is enabled.';
      }
      const bonusQty = toNumberOrNull(values.schemeBonusQty);
      if (bonusQty === null || !Number.isInteger(bonusQty) || bonusQty < 0) {
        return 'Bonus Quantity must be zero or a positive whole number when the bonus scheme is enabled.';
      }
    }
    return null;
  }

  async function handleSubmit() {
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    const payload: ProductInput = {
      name: values.name.trim(),
      code: values.code.trim(),
      company: values.company.trim() || null,
      packing: values.packing.trim() || null,
      unit: values.unit.trim() || null,
      mrp: toNumberOrNull(values.mrp) as number,
      salePrice: toNumberOrNull(values.salePrice) as number,
      discount: values.discount === '' ? 0 : (toNumberOrNull(values.discount) as number),
      schemeEnabled: values.schemeEnabled,
      schemePurchaseQty: values.schemeEnabled ? toNumberOrNull(values.schemePurchaseQty) : null,
      schemeBonusQty: values.schemeEnabled ? toNumberOrNull(values.schemeBonusQty) : null,
    };

    setIsSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasSchemePreview = values.schemeEnabled && values.schemePurchaseQty !== '' && values.schemeBonusQty !== '';

  return (
    <FormScreen>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <Field
        label="Product Name"
        required
        value={values.name}
        onChangeText={set('name')}
        maxLength={LIMITS.name}
        autoCapitalize="words"
      />
      <Field
        label="Product Code"
        required
        value={values.code}
        onChangeText={set('code')}
        maxLength={LIMITS.code}
        autoCapitalize="characters"
        autoCorrect={false}
        hint="Unique within your catalogue, e.g. PROD-0001."
      />
      <Field
        label="Company / Manufacturer"
        value={values.company}
        onChangeText={set('company')}
        maxLength={LIMITS.company}
        autoCapitalize="words"
      />
      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Packing" value={values.packing} onChangeText={set('packing')} maxLength={LIMITS.packing} placeholder="e.g. 10x10" />
        </View>
        <View style={styles.half}>
          <Field label="Unit" value={values.unit} onChangeText={set('unit')} maxLength={LIMITS.unit} placeholder="e.g. Box" />
        </View>
      </View>

      {showPhotoPicker ? (
        <ImagePickerField
          label="Product Photo"
          value={photo}
          onChange={setPhoto}
          disabled={isSubmitting}
          hint="Kept on this device for reference. The server does not store product photos yet, so it is not uploaded."
        />
      ) : null}

      <Text style={styles.sectionTitle}>Pricing</Text>
      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="MRP" required value={values.mrp} onChangeText={set('mrp')} keyboardType="decimal-pad" placeholder="0.00" />
        </View>
        <View style={styles.half}>
          <Field
            label="Sale Price"
            required
            value={values.salePrice}
            onChangeText={set('salePrice')}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        </View>
      </View>
      <Field
        label="Discount"
        value={values.discount}
        onChangeText={set('discount')}
        keyboardType="decimal-pad"
        suffix="%"
        hint="Default discount applied to this product on new orders. 0 to 100."
      />

      <Text style={styles.sectionTitle}>Bonus Scheme</Text>
      <View style={styles.switchRow}>
        <View style={styles.flex1}>
          <Text style={styles.switchLabel}>Enable bonus scheme</Text>
          <Text style={styles.hint}>Give free units when a quantity threshold is reached.</Text>
        </View>
        <Switch
          value={values.schemeEnabled}
          onValueChange={set('schemeEnabled')}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor="#fff"
        />
      </View>

      {values.schemeEnabled ? (
        <>
          <View style={styles.row}>
            <View style={styles.half}>
              <Field
                label="Purchase Quantity"
                required
                value={values.schemePurchaseQty}
                onChangeText={set('schemePurchaseQty')}
                keyboardType="number-pad"
                placeholder="e.g. 20"
              />
            </View>
            <View style={styles.half}>
              <Field
                label="Bonus Quantity"
                required
                value={values.schemeBonusQty}
                onChangeText={set('schemeBonusQty')}
                keyboardType="number-pad"
                placeholder="e.g. 2"
              />
            </View>
          </View>
          <Text style={[styles.hint, styles.schemePreview]}>
            {hasSchemePreview
              ? `Example: buy ${values.schemePurchaseQty}, get ${values.schemeBonusQty} free - shown as "${values.schemePurchaseQty} + ${values.schemeBonusQty}".`
              : 'Enter both quantities to see an example, e.g. 20 + 2.'}
          </Text>
        </>
      ) : null}

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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.sm, marginBottom: spacing.md },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  switchLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  schemePreview: { marginTop: -spacing.sm, marginBottom: spacing.lg },
  required: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md },
});
