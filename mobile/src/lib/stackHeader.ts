// Shared native-stack header look for every screen pushed above the tabs.
import { colors } from '@/lib/theme';

export const stackHeader = {
  headerShown: true,
  headerTintColor: colors.text,
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerBackTitle: 'Back',
} as const;
