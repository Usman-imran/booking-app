import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, View, type ColorValue } from 'react-native';

import { AdBanner } from '@/components/AdBanner';
import { setAdFree } from '@/lib/admob';
import { useAuth } from '@/lib/auth/AuthContext';
import { usePendingOrders } from '@/lib/offline/offlineQueue';
import { isProUser } from '@/lib/plan';
import { colors } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

type TabIconProps = { color: ColorValue; focused: boolean; size: number };

// Filled icon on a soft pill for the active tab, outline for the rest. The
// pill springs in and the icon lifts slightly when a tab becomes active -
// small enough to feel responsive without slowing anyone down. Animated with
// the native driver, so it never waits on JS.
function TabIcon({ active, inactive, color, focused }: TabIconProps & { active: IconName; inactive: IconName }) {
  const [progress] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
    }).start();
  }, [focused, progress]);

  return (
    <View style={styles.iconWrap}>
      <Animated.View
        style={[
          styles.pill,
          {
            opacity: progress,
            transform: [{ scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
          },
        ]}
      />
      <Animated.View
        style={{ transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
        <Ionicons name={focused ? active : inactive} size={22} color={color} />
      </Animated.View>
    </View>
  );
}

// The tab bar with the ad banner stacked directly on top of it. Both sit in
// the navigator's tab bar slot, which is laid out BELOW the screens rather
// than over them - so every tab's content ends above the banner, the
// banner ends above the tabs, and nothing overlaps whatever the ad's
// height. The tab bar keeps its own bottom safe-area padding.
function TabBarWithBanner(props: BottomTabBarProps) {
  return (
    <View>
      <AdBanner />
      <BottomTabBar {...props} />
    </View>
  );
}

// The signed-in area of the app. Guards every tab at once: without a
// session there is nothing to show, so bounce to sign-in - the mobile
// counterpart of the former web frontend's ProtectedRoute.
export default function TabsLayout() {
  const { user, isLoading } = useAuth();
  // Pro is ad-free: the banner below and the every-5th-order interstitial
  // both switch off (and back on if the subscription lapses).
  const isPro = isProUser(user);
  useEffect(() => {
    setAdFree(isPro);
  }, [isPro]);

  // Orders still on the device, as a badge on the Orders tab.
  const queued = usePendingOrders().length;

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
      tabBar={(props) => <TabBarWithBanner {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarBadgeStyle: styles.badge,
        tabBarHideOnKeyboard: Platform.OS === 'android',
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: (props: TabIconProps) => <TabIcon {...props} active="home" inactive="home-outline" /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarBadge: queued > 0 ? queued : undefined,
          tabBarIcon: (props: TabIconProps) => <TabIcon {...props} active="receipt" inactive="receipt-outline" />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{ title: 'Customers', tabBarIcon: (props: TabIconProps) => <TabIcon {...props} active="people" inactive="people-outline" /> }}
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
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
  },
  tabItem: { paddingHorizontal: 0 },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  iconWrap: { width: 56, height: 30, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 15, backgroundColor: colors.primarySoft },
  badge: { backgroundColor: colors.warning, color: '#fff', fontSize: 10, fontWeight: '700' },
});
