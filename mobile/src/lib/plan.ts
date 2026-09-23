import { Alert, Linking } from 'react-native';

import type { PublicUser } from './api/auth';
import { useAuth } from './auth/AuthContext';

// The freemium plan as the app sees it. The server is the authority on
// every limit (backend/src/utils/plan.js); these values only let the app
// explain a limit before a request would be refused.

export const FREE_DAILY_ORDER_LIMIT = 20;
export const PRO_PRICE_LABEL = 'Rs. 1,000';
export const PRO_PRICE_PERIOD = '/ month';

// What each plan gets, in the order the comparison table lists it.
export const PLAN_FEATURES: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: 'New orders per day', free: `${FREE_DAILY_ORDER_LIMIT}`, pro: 'Unlimited' },
  { label: 'Order receipts (JPG & PDF)', free: true, pro: true },
  { label: 'Your logo on receipts', free: false, pro: true },
  { label: 'Excel / CSV report export', free: false, pro: true },
  { label: 'Ad-free', free: false, pro: true },
];

// Which locked feature sent the booker to the paywall - picks its headline.
export type PaywallReason = 'order_limit' | 'logo' | 'export' | 'upgrade';

// Pro while the paid-up date is in the future. The date is re-checked here
// (not just `plan`) so a user cached on the device from an offline start
// drops back to Free on the day their month runs out.
export function isProUser(user: PublicUser | null | undefined) {
  if (user?.plan !== 'pro') return false;
  return !user.proUntil || new Date(user.proUntil).getTime() > Date.now();
}

export function usePlan() {
  const { user } = useAuth();
  const isPro = isProUser(user);
  return { isPro, plan: isPro ? ('pro' as const) : ('free' as const), proUntil: user?.proUntil ?? null };
}

// The admin's WhatsApp number in international form, digits only
// (e.g. 923001234567) - see .env.example.
const UPGRADE_WHATSAPP = (process.env.EXPO_PUBLIC_UPGRADE_WHATSAPP ?? '').replace(/\D/g, '');

// Starts a Pro purchase. Today that's a WhatsApp chat with the admin, who
// activates the account after payment (backend: npm run plan -- grant).
//
// RevenueCat slots in here: replace the body with
//   const { customerInfo } = await Purchases.purchasePackage(pkg);
// and have the server set pro_until from RevenueCat's webhook, so the
// callers (paywall, subscription screen) stay exactly as they are.
export async function purchasePro(user: PublicUser | null) {
  if (!UPGRADE_WHATSAPP) {
    Alert.alert('Upgrade to Pro', 'Contact your administrator to activate Pro on this account.');
    return;
  }
  const message = [
    `Hi, I'd like to upgrade to Pro (${PRO_PRICE_LABEL} ${PRO_PRICE_PERIOD}).`,
    user ? `Username: ${user.username}` : null,
    user?.companyName ? `Company: ${user.companyName}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const url = `https://wa.me/${UPGRADE_WHATSAPP}?text=${encodeURIComponent(message)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open WhatsApp', `Message +${UPGRADE_WHATSAPP} on WhatsApp to upgrade to Pro.`);
  }
}
