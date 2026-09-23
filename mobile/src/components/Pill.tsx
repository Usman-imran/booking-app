import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// The four meanings a small status pill can carry. Screens name the meaning,
// not the colour, so "money owed" is the same red everywhere it appears.
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.surfaceMuted },
  info: { fg: colors.primaryDark, bg: colors.primarySoft },
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
};

type Props = { label: string; tone?: Tone; icon?: IconName; uppercase?: boolean };

export function Pill({ label, tone = 'neutral', icon, uppercase }: Props) {
  const { fg, bg } = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <Text style={[styles.text, { color: fg }, uppercase && styles.upper]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  text: typography.badge,
  upper: { textTransform: 'uppercase' },
});
