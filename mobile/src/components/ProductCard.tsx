import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Pill } from './Pill';
import { PressableScale } from './PressableScale';
import type { Product } from '@/lib/api/products';
import { formatTier } from '@/lib/orderCalc';
import { cardShadow, colors, formatMoney, formatRs, radius, spacing, typography } from '@/lib/theme';

const ACCENTS = [colors.accent.blue, colors.accent.green, colors.accent.purple, colors.accent.orange] as const;

// The catalogue has no photos - the API stores none - so the image slot is a
// tinted tile instead of an empty grey box. The tint is picked from the
// manufacturer's name, which means every product of one company shares a
// colour and a long grid reads as groups rather than as noise.
function accentFor(company: string) {
  let hash = 0;
  for (let i = 0; i < company.length; i += 1) hash = (hash * 31 + company.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

function Thumb({ product, size }: { product: Product; size: number }) {
  const accent = accentFor(product.company ?? '');
  return (
    <View
      style={[
        styles.thumb,
        { width: size, height: size, borderRadius: size > 60 ? radius.lg : radius.md, backgroundColor: accent.bg },
      ]}>
      <Ionicons name="cube" size={size * 0.42} color={accent.fg} />
    </View>
  );
}

// What the catalogue knows about a product's standing: whether it can be
// ordered, and what is on offer if it can. A deactivated product keeps its
// row so a booker who searched for it learns why they can't add it.
function ProductTags({ product }: { product: Product }) {
  return (
    <>
      {!product.isActive ? <Pill label="Inactive" tone="neutral" icon="close-circle" uppercase /> : null}
      {product.bonusSchemes.length > 0 ? (
        <Pill label={`${product.bonusSchemes.map(formatTier).join(', ')} free`} tone="success" />
      ) : null}
      {product.discount > 0 ? <Pill label={`${product.discount}% off`} tone="warning" /> : null}
    </>
  );
}

type Props = { product: Product; onPress: () => void };

// One catalogue row: the tile, what the product is called, its code, what is
// on offer and what it costs.
export function ProductListCard({ product, onPress }: Props) {
  return (
    <PressableScale style={styles.listCard} onPress={onPress} accessibilityLabel={product.name}>
      <Thumb product={product} size={52} />

      <View style={styles.listMain}>
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {product.code}
          {product.company ? ` · ${product.company}` : ''}
          {product.packing ? ` · ${product.packing}` : ''}
        </Text>
        <View style={styles.tags}>
          <ProductTags product={product} />
        </View>
      </View>

      <View style={styles.listEnd}>
        <Text style={styles.price} numberOfLines={1}>
          {formatRs(product.salePrice)}
        </Text>
        <Text style={styles.mrp} numberOfLines={1}>
          MRP {formatMoney(product.mrp)}
        </Text>
      </View>
    </PressableScale>
  );
}

// The same product as a grid tile: bigger image slot, price on its own line,
// meant to be scanned two at a time rather than read.
export function ProductGridCard({ product, onPress }: Props) {
  return (
    <PressableScale style={styles.gridCard} onPress={onPress} accessibilityLabel={product.name}>
      <Thumb product={product} size={72} />

      <Text style={styles.name} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {product.code}
      </Text>

      <View style={styles.gridSpacer} />

      <View style={styles.tags}>
        <ProductTags product={product} />
      </View>
      <Text style={styles.price} numberOfLines={1}>
        {formatRs(product.salePrice)}
      </Text>
    </PressableScale>
  );
}

const card = {
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.border,
  ...cardShadow,
} as const;

const styles = StyleSheet.create({
  listCard: {
    ...card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md + 2,
    marginBottom: spacing.md,
  },
  listMain: { flex: 1, gap: 3 },
  listEnd: { alignItems: 'flex-end' },

  gridCard: {
    ...card,
    flex: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 4,
    alignItems: 'flex-start',
  },
  gridSpacer: { flex: 1, minHeight: spacing.xs },

  thumb: { alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.cardTitle, fontSize: 14 },
  meta: typography.cardMeta,
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  price: { ...typography.money, fontSize: 15, marginTop: 4 },
  mrp: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
