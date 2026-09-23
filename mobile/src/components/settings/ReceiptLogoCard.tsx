import { Ionicons } from '@expo/vector-icons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/form/Banner';
import { Button } from '@/components/form/Button';
import { PaywallModal } from '@/components/subscription/PaywallModal';
import { ApiRequestError } from '@/lib/api/client';
import { updateLogo } from '@/lib/api/auth';
import { useAuth } from '@/lib/auth/AuthContext';
import { usePlan } from '@/lib/plan';
import { cardShadow, colors, radius, spacing } from '@/lib/theme';

// Receipts print the logo at 40px; 256px is plenty for the PDF too and
// keeps the upload small (the server caps it at 300k characters).
const LOGO_SIZE = 256;
const MAX_DATA_URI = 280_000;

// Shrinks the picked image to LOGO_SIZE on its longer side and returns it
// as a data URI. PNG keeps a transparent background; a photo too big as
// PNG falls back to JPEG.
async function toLogoDataUri(asset: ImagePicker.ImagePickerAsset) {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > LOGO_SIZE) {
    context.resize(asset.width >= asset.height ? { width: LOGO_SIZE } : { height: LOGO_SIZE });
  }
  const image = await context.renderAsync();
  const png = await image.saveAsync({ format: SaveFormat.PNG, base64: true });
  const pngUri = `data:image/png;base64,${png.base64}`;
  if (pngUri.length <= MAX_DATA_URI) return pngUri;
  const jpeg = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  return `data:image/jpeg;base64,${jpeg.base64}`;
}

// The receipt logo, in Settings. A Pro feature: a Free account sees what it
// would get and the way to unlock it.
export function ReceiptLogoCard() {
  const { user, refreshUser } = useAuth();
  const { isPro } = usePlan();
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const logo = isPro ? user?.logo ?? null : null;

  async function pickLogo() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos access needed', 'Allow photo library access in Settings to choose your logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]) return;

    setBusy('upload');
    try {
      await updateLogo(await toLogoDataUri(result.assets[0]));
      await refreshUser();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 402) {
        // The plan lapsed since this screen opened.
        await refreshUser().catch(() => {});
        setPaywallOpen(true);
      } else {
        setError(err instanceof Error ? err.message : 'Could not upload the logo.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function removeLogo() {
    setError(null);
    setBusy('remove');
    try {
      await updateLogo(null);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the logo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.cardTitle}>Receipt logo</Text>
        <View style={[styles.badge, isPro && styles.badgeActive]}>
          <Ionicons name={isPro ? 'star' : 'lock-closed'} size={11} color={isPro ? '#fff' : colors.primaryDark} />
          <Text style={[styles.badgeText, isPro && styles.badgeTextActive]}>PRO</Text>
        </View>
      </View>

      {error ? <Banner kind="error">{error}</Banner> : null}

      {isPro ? (
        <>
          <View style={styles.previewRow}>
            <View style={styles.previewTile}>
              {logo ? (
                <Image source={{ uri: logo }} style={styles.previewImage} resizeMode="contain" />
              ) : (
                <Ionicons name="image-outline" size={28} color={colors.textMuted} />
              )}
            </View>
            <Text style={styles.note}>
              {logo
                ? 'Printed at the top of every receipt, beside your company name.'
                : 'Add your logo and it will be printed at the top of every receipt, beside your company name.'}
            </Text>
          </View>
          <Button
            title={logo ? 'Change Logo' : 'Upload Logo'}
            icon="cloud-upload-outline"
            onPress={pickLogo}
            loading={busy === 'upload'}
            disabled={busy !== null}
          />
          {logo ? (
            <Button
              title="Remove Logo"
              variant="danger"
              onPress={removeLogo}
              loading={busy === 'remove'}
              disabled={busy !== null}
              style={styles.remove}
            />
          ) : null}
        </>
      ) : (
        <Pressable onPress={() => setPaywallOpen(true)} style={({ pressed }) => [styles.locked, pressed && { opacity: 0.8 }]}>
          <View style={styles.previewTile}>
            <Ionicons name="lock-closed" size={24} color={colors.primary} />
          </View>
          <View style={styles.lockedText}>
            <Text style={styles.lockedTitle}>Brand your receipts with your logo</Text>
            <Text style={styles.note}>Available on Pro. Tap to see the plans.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      )}

      <PaywallModal visible={paywallOpen} reason="logo" onClose={() => setPaywallOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeActive: { backgroundColor: colors.primary },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: colors.primaryDark },
  badgeTextActive: { color: '#fff' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  previewTile: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: { width: 56, height: 56 },
  note: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  remove: { marginTop: spacing.sm },
  locked: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lockedText: { flex: 1, gap: 2 },
  lockedTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
});
