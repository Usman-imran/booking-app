import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

import { adUnitId, getAdsModule, getAdsStatus, initAds } from './admob';

// The "every 5th order" interstitial.
//
// Each new order the booker submits bumps a counter kept on the device.
// Orders #5, #10, #15 ... earn one full-screen ad, shown the moment the
// booker closes that order's receipt - after the work is done, never in
// the middle of it. Every other order shows nothing.
//
// Strictly that order: if the ad isn't ready when its receipt closes (no
// fill, no network, still loading) it is skipped, not carried over to
// order #6. And every step fails silently - an ad can delay nothing and
// break nothing.

export const ORDERS_PER_INTERSTITIAL = 5;
const ORDER_COUNT_KEY = 'orderBookingApp.ads.order_count';
// A failed load is retried a few times with a growing wait, then left
// until the next preload call (the next time Create Order opens).
const MAX_LOAD_RETRIES = 3;
const RETRY_BASE_MS = 10_000;
// Presenting while the receipt Modal is still animating away fails on iOS
// ("already presenting"); this lets it finish first.
const SHOW_DELAY_MS = 400;

type Interstitial = import('react-native-google-mobile-ads').InterstitialAd;

let ad: Interstitial | null = null;
let loadRetries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
// The order whose receipt close should show the ad. Tied to one order id,
// so an ad earned by an order that never reaches a receipt (saved offline)
// can't surface on a later one.
let dueForOrderId: string | null = null;

// --- Counting -------------------------------------------------------------

async function readCount() {
  try {
    const raw = await AsyncStorage.getItem(ORDER_COUNT_KEY);
    const count = raw === null ? 0 : Number(raw);
    return Number.isSafeInteger(count) && count >= 0 ? count : 0;
  } catch {
    return 0;
  }
}

// Serialised so two orders recorded back to back can't both read the same
// count and lose an increment.
let countChain: Promise<unknown> = Promise.resolve();

// Records one placed order and reports whether it is a qualifying (5th,
// 10th ...) one. `orderId` is the server id when the order has one - pass
// null for an order saved offline, which counts but can't earn an ad here
// (it has no receipt to close).
export function recordOrderPlaced(orderId: string | null): Promise<boolean> {
  const next = countChain.then(async () => {
    const count = (await readCount()) + 1;
    await AsyncStorage.setItem(ORDER_COUNT_KEY, String(count)).catch(() => {});
    const qualifies = count % ORDERS_PER_INTERSTITIAL === 0;
    if (qualifies && orderId) {
      dueForOrderId = orderId;
      // Normally already loaded by the preload; if not, this is the last
      // chance before the receipt closes.
      preloadInterstitial();
    }
    return qualifies;
  });
  countChain = next.catch(() => {});
  return next.catch(() => false);
}

// --- Loading ------------------------------------------------------------

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function createAd(): Interstitial | null {
  const ads = getAdsModule();
  const unitId = adUnitId('interstitial');
  if (!ads || !unitId) return null;
  try {
    const instance = ads.InterstitialAd.createForAdRequest(unitId);
    instance.addAdEventListener(ads.AdEventType.LOADED, () => {
      loadRetries = 0;
    });
    instance.addAdEventListener(ads.AdEventType.ERROR, (error) => {
      console.warn('[ads] interstitial failed:', error?.message ?? error);
      if (loadRetries >= MAX_LOAD_RETRIES) return;
      loadRetries += 1;
      clearRetry();
      retryTimer = setTimeout(() => safeLoad(), RETRY_BASE_MS * 2 ** (loadRetries - 1));
    });
    // An interstitial can be shown once; load the next straight away so it
    // is ready five orders from now (loaded ads stay valid for an hour).
    instance.addAdEventListener(ads.AdEventType.CLOSED, () => safeLoad());
    return instance;
  } catch (err) {
    console.warn('[ads] could not create interstitial:', err);
    return null;
  }
}

function safeLoad() {
  try {
    ad?.load(); // a no-op while already loaded or loading
  } catch (err) {
    console.warn('[ads] interstitial load threw:', err);
  }
}

// Starts loading the ad in the background so it's ready the moment it's
// due. Cheap to call often: it does nothing when an ad is already loaded
// or on its way.
export function preloadInterstitial() {
  // Waits for consent + SDK start-up; requests nothing if ads can't run.
  initAds().then((status) => {
    if (status !== 'ready') return;
    ad ??= createAd();
    loadRetries = 0;
    safeLoad();
  });
}

// --- Showing ---------------------------------------------------------------

// Call when the booker closes an order's receipt. Shows the interstitial
// if - and only if - this order is a qualifying one and the ad is loaded.
// Resolves once the attempt is over; never rejects.
export async function showInterstitialIfDue(orderId: string | null | undefined): Promise<void> {
  if (!orderId || orderId !== dueForOrderId) return;
  // Consumed either way: skipped now means skipped, not postponed.
  dueForOrderId = null;
  if (getAdsStatus() !== 'ready' || !ad?.loaded) return;

  await new Promise((resolve) => setTimeout(resolve, SHOW_DELAY_MS));
  try {
    // show() throws synchronously when the ad isn't ready and can reject
    // natively (app backgrounded, another screen presenting).
    await ad.show();
  } catch (err) {
    console.warn('[ads] interstitial could not be shown:', err);
    safeLoad();
  }
}

// Preloads when a screen that can lead to a qualifying order mounts.
export function useInterstitialPreload() {
  useEffect(() => {
    preloadInterstitial();
  }, []);
}
