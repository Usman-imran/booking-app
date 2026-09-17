import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { colors, radius, spacing } from '@/lib/theme';

export type PickedImage = { uri: string; width: number; height: number; fileName: string | null };

type Props = {
  label: string;
  value: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  hint?: string;
  disabled?: boolean;
};

// Camera / gallery picker with a preview. Permissions are requested lazily,
// the first time each source is used, and a denial explains what to do
// rather than failing silently.
export function ImagePickerField({ label, value, onChange, hint, disabled }: Props) {
  const [busy, setBusy] = useState<'camera' | 'library' | null>(null);

  async function pick(source: 'camera' | 'library') {
    setBusy(source);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in Settings to take a product photo.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Photos access needed', 'Allow photo library access in Settings to choose a product photo.');
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      onChange({ uri: asset.uri, width: asset.width, height: asset.height, fileName: asset.fileName ?? null });
    } catch (err) {
      Alert.alert('Could not pick an image', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>

      {value ? (
        <View style={styles.previewRow}>
          <Image source={{ uri: value.uri }} style={styles.preview} />
          <View style={styles.previewText}>
            <Text style={styles.previewName} numberOfLines={1}>
              {value.fileName ?? 'Photo'}
            </Text>
            <Text style={styles.previewMeta}>
              {value.width} × {value.height}
            </Text>
            <Pressable onPress={() => onChange(null)} disabled={disabled} hitSlop={8}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="image-outline" size={28} color={colors.textMuted} />
          <Text style={styles.placeholderText}>No photo selected</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button
          title="Take Photo"
          icon="camera-outline"
          variant="secondary"
          compact
          onPress={() => pick('camera')}
          loading={busy === 'camera'}
          disabled={disabled || busy !== null}
          style={styles.action}
        />
        <Button
          title="Choose from Gallery"
          icon="images-outline"
          variant="secondary"
          compact
          onPress={() => pick('library')}
          loading={busy === 'library'}
          disabled={disabled || busy !== null}
          style={styles.action}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 110,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  placeholderText: { fontSize: 13, color: colors.textMuted },
  previewRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  preview: { width: 84, height: 84, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  previewText: { flex: 1, gap: 2 },
  previewName: { fontSize: 14, fontWeight: '600', color: colors.text },
  previewMeta: { fontSize: 12, color: colors.textMuted },
  remove: { fontSize: 13, fontWeight: '600', color: colors.danger, marginTop: 4 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
});
