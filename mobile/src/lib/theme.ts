// Single source of truth for the app's look. The palette continues what the
// sign-in and original dashboard screens already used, so existing screens
// and new ones read as one app.
export const colors = {
  primary: '#208AEF',
  primarySoft: '#e3f0fd',
  primaryDark: '#1668b8',
  background: '#f6f8fb',
  surface: '#ffffff',
  surfaceMuted: '#f4f6f9',
  border: '#e6eaf0',
  text: '#1a2233',
  textSecondary: '#3a4250',
  textMuted: '#5b6472',
  danger: '#b3261e',
  dangerSoft: '#fdecec',
  // A stronger red for money owed - reads as an alert next to dangerSoft.
  dangerStrong: '#d93a30',
  success: '#1e8e5a',
  successSoft: '#e4f5ec',
  warning: '#b7791f',
  warningSoft: '#fdf3e0',
  // The two greys behind pressed/selected chrome that isn't a card.
  track: '#eef1f6',
  overlay: 'rgba(15, 30, 51, 0.45)',
  // Accents for the quick-action tiles - each action gets its own hue so
  // they can be told apart at a glance.
  accent: {
    blue: { fg: '#208AEF', bg: '#e3f0fd' },
    green: { fg: '#1e8e5a', bg: '#e4f5ec' },
    purple: { fg: '#6d4fc2', bg: '#ede8fa' },
    orange: { fg: '#d9822b', bg: '#fdf0e3' },
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

// A soft elevation shared by every card. iOS uses the shadow props, Android
// only reads `elevation`.
export const cardShadow = {
  shadowColor: '#0f1e33',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

// Barely-there elevation for chrome that sits ON a card (chips, segment
// thumbs) - enough to lift it off the track without a second card shadow.
export const subtleShadow = {
  shadowColor: '#0f1e33',
  shadowOpacity: 0.05,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

// What floats above everything: the FAB and the tab bar.
export const floatingShadow = {
  shadowColor: '#0f1e33',
  shadowOpacity: 0.18,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
} as const;

// The type scale. Screens reach for these instead of restating sizes, so a
// title on Orders is the same title on Products.
export const typography = {
  screenTitle: { fontSize: 26, fontWeight: '700', color: colors.text },
  screenSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted },
  money: { fontSize: 16, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  badge: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  groupHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
} as const;

// Fixed sizes the tab bar, the ad slot and the floating buttons agree on,
// so a screen can reserve exactly the room they take.
export const layout = {
  tabBarRowHeight: 58,
  fabSize: 56,
  // Gap between a FAB and whatever it floats over.
  fabInset: 20,
} as const;

export const STATUS_STYLES: Record<string, { fg: string; bg: string; label: string }> = {
  submitted: { fg: colors.success, bg: colors.successSoft, label: 'Submitted' },
  draft: { fg: colors.warning, bg: colors.warningSoft, label: 'Draft' },
  cancelled: { fg: colors.danger, bg: colors.dangerSoft, label: 'Cancelled' },
};

// Every figure the app shows is in rupees, so the unit is part of the
// formatting rather than something each screen remembers to prepend.
export const CURRENCY = 'Rs';

export function formatRs(value: number) {
  return `${CURRENCY} ${formatMoney(value)}`;
}

export function formatCompactRs(value: number) {
  return `${CURRENCY} ${formatCompactMoney(value)}`;
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value ?? 0
  );
}

// Compact form for stat cards, where "1.2M" reads better than a full
// figure squeezed into a small tile.
export function formatCompactMoney(value: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value ?? 0
  );
}

export function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function initialsOf(name: string | null | undefined) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
