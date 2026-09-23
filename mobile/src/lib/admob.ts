import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

// Google AdMob, for the whole app: which ad units to use, whether ads can
// run on this build at all, and the one-time consent + SDK start-up.
//
// Everything here is written so that ads can only ever FAIL QUIETLY. A
// booker's job is taking orders; no ad problem (no fill, no network, no
// consent, a build without the native module) may block or crash that.

type AdsModule = typeof import('react-native-google-mobile-ads');

// --- Configuration ------------------------------------------------------

// Google's public test units (the same ones the library's TestIds carry).
// They always fill and are safe to tap.
const TEST_UNITS = {
  android: {
    banner: 'ca-app-pub-3940256099942544/9214589741',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2435281174',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
} as const;

// Real units come from the environment (see .env.example), so switching
// accounts or units never needs a code change.
const LIVE_UNITS = {
  android: {
    banner: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
    interstitial: process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID,
  },
  ios: {
    banner: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID,
    interstitial: process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID,
  },
};

// Test ads in every development build, always. Tapping your own live ads
// (which is what happens while developing) can get an AdMob account
// suspended. EXPO_PUBLIC_ADMOB_USE_TEST_IDS=true forces them in a release
// build too - for a preview APK handed to testers.
export const USING_TEST_ADS = __DEV__ || process.env.EXPO_PUBLIC_ADMOB_USE_TEST_IDS === 'true';

export type AdFormat = 'banner' | 'interstitial';

const warnedMissing = new Set<AdFormat>();

// The unit to request, or null when this build has none configured - in
// which case that format is simply not shown.
export function adUnitId(format: AdFormat): string | null {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
  if (!platform) return null;
  if (USING_TEST_ADS) return TEST_UNITS[platform][format];
  const id = LIVE_UNITS[platform][format]?.trim();
  if (!id) {
    // Called on every banner render; once per format is plenty.
    if (!warnedMissing.has(format)) {
      warnedMissing.add(format);
      console.warn(`[ads] no ${platform} ${format} unit configured (EXPO_PUBLIC_ADMOB_*); that ad is disabled.`);
    }
    return null;
  }
  return id;
}

// --- Native module ------------------------------------------------------

// The SDK is a native module: it doesn't exist on web, nor in Expo Go
// (which ships a fixed set of native code), and requiring it there throws.
// So it's required lazily, only where it can exist, and a failure turns
// ads off rather than taking the app down.
let adsModule: AdsModule | null | undefined;

export function getAdsModule(): AdsModule | null {
  if (adsModule !== undefined) return adsModule;
  const supported =
    (Platform.OS === 'android' || Platform.OS === 'ios') &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  if (!supported) {
    adsModule = null;
    return adsModule;
  }
  try {
    // Deliberately require(), not import: an import is evaluated eagerly on
    // every platform, which is exactly what has to be avoided here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    adsModule = require('react-native-google-mobile-ads') as AdsModule;
  } catch (err) {
    console.warn('[ads] Google Mobile Ads native module unavailable; ads disabled:', err);
    adsModule = null;
  }
  return adsModule;
}

// --- Start-up: consent, then the SDK -----------------------------------

// 'pending' until start-up settles; 'ready' when ads may be requested;
// 'unavailable' for any reason they may not (unsupported build, the user
// declined consent, the SDK failed to start). Banners render nothing and
// interstitials are skipped unless 'ready'.
export type AdsStatus = 'pending' | 'ready' | 'unavailable';

let status: AdsStatus = 'pending';
let startPromise: Promise<AdsStatus> | null = null;
const listeners = new Set<() => void>();

function setStatus(next: AdsStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

// Asks for consent where the law requires it (EEA/UK/some US states - the
// UMP SDK decides, and shows Google's form only there), then starts the
// SDK. Safe to call any number of times; never throws.
export function initAds(): Promise<AdsStatus> {
  if (startPromise) return startPromise;
  startPromise = (async () => {
    const ads = getAdsModule();
    if (!ads) {
      setStatus('unavailable');
      return status;
    }
    try {
      // A consent failure (usually no network) doesn't stop start-up: UMP
      // still reports from its cached answer whether ads may be requested.
      await ads.AdsConsent.gatherConsent().catch((err: unknown) => console.warn('[ads] consent check failed:', err));
      const { canRequestAds } = await ads.AdsConsent.getConsentInfo();
      if (!canRequestAds) {
        setStatus('unavailable');
        return status;
      }
      await ads.default().initialize();
      setStatus('ready');
    } catch (err) {
      console.warn('[ads] start-up failed; ads disabled for this session:', err);
      setStatus('unavailable');
    }
    return status;
  })();
  return startPromise;
}

// Pro accounts are ad-free. Set from the signed-in user's plan (tabs
// layout); while on, every ad reads as unavailable - banners collapse and
// interstitials are neither loaded nor shown - without touching consent or
// the SDK, so ads come back at once if the plan lapses.
let adFree = false;

export function setAdFree(next: boolean) {
  if (adFree === next) return;
  adFree = next;
  listeners.forEach((listener) => listener());
}

export function getAdsStatus(): AdsStatus {
  return adFree ? 'unavailable' : status;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAdsStatus() {
  return useSyncExternalStore(subscribe, getAdsStatus);
}

// --- Privacy options ------------------------------------------------------

// Where the consent form was shown, Google requires a way to change the
// answer later. True when this user needs that entry point.
export async function isAdPrivacyOptionsRequired() {
  const ads = getAdsModule();
  if (!ads) return false;
  try {
    const info = await ads.AdsConsent.getConsentInfo();
    return info.privacyOptionsRequirementStatus === ads.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  } catch {
    return false;
  }
}

export async function showAdPrivacyOptions() {
  const ads = getAdsModule();
  if (!ads) return;
  try {
    await ads.AdsConsent.showPrivacyOptionsForm();
  } catch (err) {
    console.warn('[ads] privacy options form failed:', err);
  }
}
