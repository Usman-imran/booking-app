import { StyleSheet, Text, View } from 'react-native';

import { ADS_ENABLED, AD_BANNER_HEIGHT } from '@/lib/ads';
import { colors, typography } from '@/lib/theme';

// The strip the bottom banner ad occupies, rendered directly above the tab
// bar. Returns null while ads are off so the bar keeps its normal height;
// when they are on it holds the banner's exact size, which stops the layout
// jumping between "ad not loaded yet" and "ad shown".
//
// Drop the ad SDK's banner component in place of the placeholder below.
export function AdBannerSlot() {
  if (!ADS_ENABLED) return null;

  return (
    <View style={styles.slot}>
      <Text style={styles.placeholder}>Sponsored</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: AD_BANNER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  placeholder: { ...typography.badge, color: colors.textMuted, textTransform: 'uppercase' },
});
