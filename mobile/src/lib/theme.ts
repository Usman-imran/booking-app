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
  success: '#1e8e5a',
  successSoft: '#e4f5ec',
  warning: '#b7791f',
  warningSoft: '#fdf3e0',
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

export const STATUS_STYLES: Record<string, { fg: string; bg: string; label: string }> = {
  submitted: { fg: colors.success, bg: colors.successSoft, label: 'Submitted' },
  draft: { fg: colors.warning, bg: colors.warningSoft, label: 'Draft' },
  cancelled: { fg: colors.danger, bg: colors.dangerSoft, label: 'Cancelled' },
};

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
