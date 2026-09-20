import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Field } from './Field';
import { FormScreen } from './FormScreen';
import { ImagePickerField, type PickedImage } from './ImagePickerField';
import type { BonusScheme, ProductInput } from '@/lib/api/products';
import { colors, spacing } from '@/lib/theme';

// Same character limits the API enforces (products.routes.js).
const LIMITS = { name: 200, code: 50, company: 150, packing: 100, unit: 50 };

// Same cap as the API: more tiers than this is a typo, not a scheme.
const MAX_BONUS_SCHEMES = 10;

// One editable scheme tier. `key` only exists so React can tell rows apart
// as they are added and removed; it is never sent to the server.
export type BonusSchemeRow = { key: string; buyQty: string; bonusQty: string };

export type ProductFormValues = {
  name: string;
  code: string;
  company: string;
  packing: string;
  unit: string;
  mrp: string;
  salePrice: string;
  discount: string;
  bonusSchemes: BonusSchemeRow[];
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
  bonusSchemes: [],
};

let nextRowKey = 0;

export function newSchemeRow(tier?: BonusScheme): BonusSchemeRow {
  nextRowKey += 1;
  return {
    key: `scheme-${nextRowKey}`,
    buyQty: tier ? String(tier.purchaseQty) : '',
    bonusQty: tier ? String(tier.bonusQty) : '',
  };
}

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

type SchemeRowErrors = { buyQty?: boolean; bonusQty?: boolean };

type FieldErrors = Partial<Record<Exclude<keyof ProductFormValues, 'bonusSchemes'>, boolean>> & {
  // Keyed by the row's `key`, so an error stays with its row when another
  // row above it is removed.
  bonusSchemes?: Record<string, SchemeRowErrors>;
};

// The mobile counterpart of the web's ProductForm, shared by Add and Edit:
// same fields, validation and payload. Numeric values stay strings in state
// so a box can be cleared mid-edit; they are converted once, on submit. A
// missing or invalid field is flagged with a red border rather than a banner.
//
// A product can carry several bonus tiers ("10 + 1", "50 + 6", ...), so the
// scheme section is a list of rows the booker adds to and removes from;
// no rows means no scheme.
export function ProductForm({ initialValues, submitLabel, onSubmit, onCancel, showPhotoPicker }: Props) {
  const [values, setValues] = useState<ProductFormValues>({ ...EMPTY_PRODUCT_FORM, ...initialValues });
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function set<K extends Exclude<keyof ProductFormValues, 'bonusSchemes'>>(field: K) {
    return (value: ProductFormValues[K]) => {
      setErrors((current) => (current[field] ? { ...current, [field]: false } : current));
      setValues((current) => ({ ...current, [field]: value }));
    };
  }

  function setSchemeField(key: string, field: 'buyQty' | 'bonusQty') {
    return (text: string) => {
      setErrors((current) => {
        const rowErrors = current.bonusSchemes?.[key];
        if (!rowErrors?.[field]) return current;
        return { ...current, bonusSchemes: { ...current.bonusSchemes, [key]: { ...rowErrors, [field]: false } } };
      });
      setValues((current) => ({
        ...current,
        bonusSchemes: current.bonusSchemes.map((row) => (row.key === key ? { ...row, [field]: text } : row)),
      }));
    };
  }

  function addScheme() {
    setValues((current) =>
      current.bonusSchemes.length >= MAX_BONUS_SCHEMES
        ? current
        : { ...current, bonusSchemes: [...current.bonusSchemes, newSchemeRow()] }
    );
  }

  function removeScheme(key: string) {
    setValues((current) => ({ ...current, bonusSchemes: current.bonusSchemes.filter((row) => row.key !== key) }));
    setErrors((current) => {
      if (!current.bonusSchemes?.[key]) return current;
      const { [key]: _removed, ...rest } = current.bonusSchemes;
      return { ...current, bonusSchemes: rest };
    });
  }

  // Same rules as the API, reported per field so every problem is
  // highlighted at once instead of one message at a time.
  function validate(): FieldErrors {
    const problems: FieldErrors = {};
    if (!values.name.trim()) problems.name = true;
    if (!values.code.trim()) problems.code = true;

    const mrp = toNumberOrNull(values.mrp);
    if (mrp === null || mrp < 0) problems.mrp = true;

    const salePrice = toNumberOrNull(values.salePrice);
    if (salePrice === null || salePrice < 0) problems.salePrice = true;

    const discount = values.discount === '' ? 0 : toNumberOrNull(values.discount);
    if (discount === null || discount < 0 || discount > 100) problems.discount = true;

    // Every row needs a positive whole purchase quantity and a bonus of
    // zero or more, and no two rows may share a purchase quantity - the
    // server could not tell which one applies.
    const seenBuyQty = new Map<number, string>();
    for (const row of values.bonusSchemes) {
      const rowErrors: SchemeRowErrors = {};
      const buyQty = toNumberOrNull(row.buyQty);
      if (buyQty === null || !Number.isInteger(buyQty) || buyQty <= 0) {
        rowErrors.buyQty = true;
      } else if (seenBuyQty.has(buyQty)) {
        rowErrors.buyQty = true;
      } else {
        seenBuyQty.set(buyQty, row.key);
      }
      const bonusQty = toNumberOrNull(row.bonusQty);
      if (bonusQty === null || !Number.isInteger(bonusQty) || bonusQty < 0) rowErrors.bonusQty = true;

      if (rowErrors.buyQty || rowErrors.bonusQty) {
        problems.bonusSchemes = { ...problems.bonusSchemes, [row.key]: rowErrors };
      }
    }
    return problems;
  }

  async function handleSubmit() {
    const problems = validate();
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    const payload: ProductInput = {
      name: values.name.trim(),
      code: values.code.trim(),
      company: values.company.trim() || null,
      packing: values.packing.trim() || null,
      unit: values.unit.trim() || null,
      mrp: toNumberOrNull(values.mrp) as number,
      salePrice: toNumberOrNull(values.salePrice) as number,
      discount: values.discount === '' ? 0 : (toNumberOrNull(values.discount) as number),
      bonusSchemes: values.bonusSchemes
        .map((row) => ({ purchaseQty: Number(row.buyQty), bonusQty: Number(row.bonusQty) }))
        .sort((a, b) => a.purchaseQty - b.purchaseQty),
    };

    setIsSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      Alert.alert('Could not save product', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // "10 + 1, 50 + 6" for the rows that are filled in, in the order they
  // will apply.
  const schemePreview = values.bonusSchemes
    .filter((row) => row.buyQty !== '' && row.bonusQty !== '')
    .map((row) => ({ buy: Number(row.buyQty), bonus: Number(row.bonusQty) }))
    .filter((tier) => Number.isFinite(tier.buy) && Number.isFinite(tier.bonus))
    .sort((a, b) => a.buy - b.buy)
    .map((tier) => `${tier.buy} + ${tier.bonus}`)
    .join(', ');

  return (
    <FormScreen>
      <Field
        label="Product Name"
        required
        value={values.name}
        onChangeText={set('name')}
        error={errors.name}
        maxLength={LIMITS.name}
        autoCapitalize="words"
      />
      <Field
        label="Product Code"
        required
        value={values.code}
        onChangeText={set('code')}
        error={errors.code}
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
          <Field
            label="MRP"
            required
            value={values.mrp}
            onChangeText={set('mrp')}
            error={errors.mrp}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        </View>
        <View style={styles.half}>
          <Field
            label="Sale Price"
            required
            value={values.salePrice}
            onChangeText={set('salePrice')}
            error={errors.salePrice}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        </View>
      </View>
      <Field
        label="Discount"
        value={values.discount}
        onChangeText={set('discount')}
        error={errors.discount}
        keyboardType="decimal-pad"
        suffix="%"
        hint="Default discount applied to this product on new orders. 0 to 100."
      />

      <Text style={styles.sectionTitle}>Bonus Schemes</Text>
      <Text style={[styles.hint, styles.sectionHint]}>
        Give free units when a quantity threshold is reached. Add a row per tier, e.g. 10 + 1 and 50 + 6; the highest
        tier an order reaches is the one applied.
      </Text>

      {values.bonusSchemes.map((row, index) => {
        const rowErrors = errors.bonusSchemes?.[row.key];
        return (
          <View key={row.key} style={styles.schemeRow}>
            <View style={styles.flex1}>
              <Field
                label={`Buy Qty${index === 0 ? '' : ` (tier ${index + 1})`}`}
                required
                value={row.buyQty}
                onChangeText={setSchemeField(row.key, 'buyQty')}
                error={rowErrors?.buyQty}
                keyboardType="number-pad"
                placeholder="e.g. 20"
              />
            </View>
            <View style={styles.flex1}>
              <Field
                label="Bonus Qty"
                required
                value={row.bonusQty}
                onChangeText={setSchemeField(row.key, 'bonusQty')}
                error={rowErrors?.bonusQty}
                keyboardType="number-pad"
                placeholder="e.g. 2"
              />
            </View>
            <Pressable
              onPress={() => removeScheme(row.key)}
              disabled={isSubmitting}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove bonus scheme ${index + 1}`}
              style={({ pressed }) => [styles.removeButton, pressed && styles.removeButtonPressed]}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </View>
        );
      })}

      {values.bonusSchemes.length < MAX_BONUS_SCHEMES ? (
        <Button
          title="Add Bonus Scheme"
          icon="add"
          variant="secondary"
          onPress={addScheme}
          disabled={isSubmitting}
          compact
          style={styles.addScheme}
        />
      ) : null}

      <Text style={[styles.hint, styles.schemePreview]}>
        {values.bonusSchemes.length === 0
          ? 'No bonus scheme. Orders for this product will not earn free units.'
          : schemePreview
            ? `Shown as "${schemePreview}".`
            : 'Enter both quantities to see how the scheme will be shown, e.g. 20 + 2.'}
      </Text>

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
  sectionHint: { marginTop: -spacing.sm, marginBottom: spacing.md },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  schemeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // Lines the icon up with the input boxes, below the row's labels.
  removeButton: { marginTop: 25, height: 48, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  removeButtonPressed: { backgroundColor: colors.dangerSoft },
  addScheme: { alignSelf: 'flex-start', marginBottom: spacing.md },
  schemePreview: { marginBottom: spacing.lg },
  required: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md },
});
