import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';

import { adUnitId, getAdsModule, useAdsStatus } from '@/lib/admob';
import { colors } from '@/lib/theme';

// After a failed load (no fill is routine), the banner stays collapsed for
// this long and then asks again with a fresh ad view.
const RETRY_AFTER_MS = 60_000;

// An anchored adaptive banner: full width, height chosen by Google for the
// device. Laid out in normal flow (never absolute), so whatever sits above
// it - a tab screen's list - simply ends where the banner starts and
// nothing is ever hidden behind it.
//
// Renders nothing until an ad has actually loaded, and collapses again on
// any failure, so a no-fill or an offline phone never leaves an empty gap.
export function AdBanner() {
  const status = useAdsStatus();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped to remount the ad view for a fresh request after a failure.
  const [attempt, setAttempt] = useState(0);
  const keyboardOpen = useKeyboardOpen();

  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => {
      setLoaded(false);
      setFailed(false);
      setAttempt((n) => n + 1);
    }, RETRY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [failed]);

  const ads = getAdsModule();
  const unitId = adUnitId('banner');
  if (status !== 'ready' || !ads || !unitId || failed) return null;

  const { BannerAd, BannerAdSize } = ads;

  return (
    // Hidden (not unmounted) while the Android keyboard is up: the tab bar
    // hides itself then, and an ad floating above the keyboard would cover
    // the field being typed in. Staying mounted keeps the loaded ad.
    <View style={[styles.container, !loaded && styles.collapsed, keyboardOpen && styles.collapsed]}>
      <BannerAd
        key={attempt}
        unitId={unitId}
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={(error) => {
          console.warn('[ads] banner failed:', error?.message ?? error);
          setFailed(true);
        }}
      />
    </View>
  );
}

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Zero height rather than unmounted, so the native view keeps loading.
  collapsed: { height: 0, overflow: 'hidden', borderTopWidth: 0 },
});
