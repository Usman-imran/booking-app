import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { AppTabBar } from '@/components/navigation/AppTabBar';
import { useAuth } from '@/lib/auth/AuthContext';
import { colors } from '@/lib/theme';

// The signed-in area of the app. Guards every tab at once: without a
// session there is nothing to show, so bounce to sign-in - the mobile
// counterpart of the former web frontend's ProtectedRoute.
//
// Five tabs, in the order a booker works: the dashboard, the orders they
// book, the shops they book them for, the catalogue they book from, and
// their own account. `AppTabBar` draws the bar itself (active pill, icon
// micro-animations, and the slot the bottom banner ad sits in).
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
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: Platform.OS === 'android',
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers' }} />
      <Tabs.Screen name="products" options={{ title: 'Products' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
