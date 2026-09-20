import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Platform, StyleSheet, View, type ColorValue } from 'react-native';

import { useAuth } from '@/lib/auth/AuthContext';
import { colors } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

type TabIconProps = { color: ColorValue; focused: boolean; size: number };

// Each tab has a filled icon for the active state and an outline for the
// rest, which is the convention on both platforms.
function TabIcon({ active, inactive, color, focused, size }: TabIconProps & { active: IconName; inactive: IconName }) {
  return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
}

// The signed-in area of the app. Guards every tab at once: without a
// session there is nothing to show, so bounce to sign-in - the mobile
// counterpart of the former web frontend's ProtectedRoute.
export default function TabsLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarHideOnKeyboard: Platform.OS === 'android',
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: (props: TabIconProps) => <TabIcon {...props} active="home" inactive="home-outline" /> }} />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Orders', tabBarIcon: (props: TabIconProps) => <TabIcon {...props} active="receipt" inactive="receipt-outline" /> }}
      />
      <Tabs.Screen
        name="products"
        options={{ title: 'Products', tabBarIcon: (props: TabIconProps) => <TabIcon {...props} active="cube" inactive="cube-outline" /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: (props: TabIconProps) => <TabIcon {...props} active="person" inactive="person-outline" /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.OS === 'ios' ? 84 : 64,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
  },
  tabLabel: { fontSize: 11, fontWeight: '600' },
});
