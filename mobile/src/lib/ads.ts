// Where the bottom banner ad lives.
//
// The app ships no ad SDK yet, so this module is the single place that says
// how tall a banner is and whether there is one at all. The tab bar reserves
// the space from these values, which means screen content is laid out above
// the banner automatically - no screen has to know an ad exists.
//
// To turn ads on: install the SDK, render its banner from `AdBannerSlot`
// and flip ADS_ENABLED. Nothing else has to change.
export const ADS_ENABLED = false;

// A standard mobile banner (320x50). Keep this in step with whatever size
// the ad unit is actually requested at, or the reserved strip won't match.
export const AD_BANNER_HEIGHT = 50;

// What the banner occupies in a layout right now - zero while ads are off,
// so the tab bar collapses to its normal height.
export const adBannerReservedHeight = ADS_ENABLED ? AD_BANNER_HEIGHT : 0;
