import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import type { Product } from '@/lib/api/products';
import { formatTier } from '@/lib/orderCalc';
import { cardShadow, colors, formatMoney, radius, spacing } from '@/lib/theme';

// One tile tint per manufacturer. The catalogue stores no photos, so the
// image slot is a tinted monogram instead of an empty grey box - and
// because the tint comes from the company name, every product of one
// company shares a colour and a long grid reads as groups, not as noise.
const TINTS = [
  { fg: '#208AEF', bg: '#E3F0FD' },
  { fg: '#1E8E5A', bg: '#E4F5EC' },
  { fg: '#6D4FC2', bg: '#EDE8FA' },
  { fg: '#D9822B', bg: '#FDF0E3' },
  { fg: '#C2410C', bg: '#FFEDD5' },
  { fg: '#0E7490', bg: '#CFFAFE' },
] as const;

function tintFor(company: string | null) {
  const name = company ?? '';
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

// The first letters of the product's name - the closest thing to a picture
// the catalogue actually has.
function monogramOf(name: string) {
  const letters = name.trim().replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/);
  return ((letters[0]?.[0] ?? '') + (letters[1]?.[0] ?? '')).toUpperCase() || '#';
}

function Thumb({ product, size }: { product: Product; size: number }) {
  const tint = tintFor(product.company);
  return (
    <View
      style={[
        styles.thumb,
        {
          width: size,
          height: size,
          borderRadius: size >= 60 ? radius.lg : radius.md,
          backgroundColor: product.isActive ? tint.bg : colors.surfaceMuted,
        },
      ]}>
      <Text
        style={[
          styles.thumbText,
          { fontSize: size * 0.34, color: product.isActive ? tint.fg : colors.textMuted },
        ]}>
        {monogramOf(product.name)}
      </Text>
    </View>
  );
}

// What is worth knowing about a product before opening it: whether it can
// be ordered at all, and what is on offer if it can.
function Tags({ product }: { product: Product }) {
  return (
    <>
      {!product.isActive ? <Text style={[styles.tag, styles.tagInactive]}>Inactive</Text> : null}
      {product.bonusSchemes.length > 0 ? (
        <Text style={[styles.tag, styles.tagScheme]} numberOfLines={1}>
          {product.bonusSchemes.map(formatTier).join(', ')} free
        </Text>
      ) : null}
      {product.discount > 0 ? <Text style={[styles.tag, styles.tagDiscount]}>{product.discount}% off</Text> : null}
    </>
  );
}

function Price({ product, align }: { product: Product; align: 'left' | 'right' }) {
  return (
    <View style={align === 'right' ? styles.priceRight : undefined}>
      <Text style={styles.price}>
        <Text style={styles.currency}>Rs </Text>
        {formatMoney(product.salePrice)}
      </Text>
      {product.mrp > product.salePrice ? (
        <Text style={styles.mrp}>MRP {formatMoney(product.mrp)}</Text>
      ) : null}
    </View>
  );
}

type Props = { product: Product; onPress: () => void };

// The catalogue as a row: read left to right, one product per line.
export function ProductListCard({ product, onPress }: Props) {
  return (
    <PressableScale style={styles.listCard} onPress={onPress} accessibilityLabel={product.name}>
      <Thumb product={product} size={46} />
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
          <Tags product={product} />
        </View>
      </View>
      <Price product={product} align="right" />
    </PressableScale>
  );
}

// The same product as a tile: a bigger image slot and the price on its own
// line, meant to be scanned two at a time rather than read.
export function ProductGridCard({ product, onPress }: Props) {
  return (
    <PressableScale style={styles.gridCard} onPress={onPress} accessibilityLabel={product.name}>
      <Thumb product={product} size={64} />
      <Text style={styles.name} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {product.code}
      </Text>
      {product.company ? (
        <Text style={styles.company} numberOfLines={1}>
          {product.company}
        </Text>
      ) : null}

      {/* Pushes the price to the bottom so it lines up across a row of
          tiles whose names wrap to different heights. */}
      <View style={styles.gridSpacer} />

      <View style={styles.tags}>
        <Tags product={product} />
      </View>
      <Price product={product} align="left" />
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
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  listMain: { flex: 1, gap: 3 },

  gridCard: {
    ...card,
    flex: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 3,
    alignItems: 'flex-start',
  },
  gridSpacer: { flex: 1, minHeight: spacing.xs },

  thumb: { alignItems: 'center', justifyContent: 'center' },
  thumbText: { fontWeight: '800', letterSpacing: -0.3 },

  name: { fontSize: 14, fontWeight: '700', color: colors.text, letterSpacing: -0.1 },
  meta: { fontSize: 12, color: colors.textMuted },
  company: { fontSize: 11.5, color: colors.textSecondary, fontWeight: '600' },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 3 },
  tag: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  tagInactive: { color: colors.textMuted, backgroundColor: colors.surfaceMuted },
  tagScheme: { color: colors.success, backgroundColor: colors.successSoft },
  tagDiscount: { color: colors.warning, backgroundColor: colors.warningSoft },

  priceRight: { alignItems: 'flex-end' },
  price: { fontSize: 14.5, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'], marginTop: 4 },
  currency: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  mrp: { fontSize: 11, color: colors.textMuted, marginTop: 1, fontVariant: ['tabular-nums'] },
});
