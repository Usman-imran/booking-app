import { StyleSheet, Text, View } from 'react-native';

import { colors, initialsOf } from '@/lib/theme';

type Props = { name: string | null | undefined; size?: number };

// Initials on a tinted circle - the app has no profile photos, so this is
// the avatar everywhere a user is shown.
export function Avatar({ name, size = 44 }: Props) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.text, { fontSize: size * 0.38 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  text: { color: colors.primaryDark, fontWeight: '700' },
});
