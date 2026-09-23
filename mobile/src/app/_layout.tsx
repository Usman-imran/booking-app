import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/lib/auth/AuthContext';
import { colors } from '@/lib/theme';

// Expo Router picks this export up automatically and renders it in place of
// the route tree when a render or load error escapes, instead of a blank
// crash screen - so config/network mistakes show a readable message.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorMessage}>{error.message}</Text>
      <Pressable onPress={retry} style={styles.retryButton}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="analytics" options={{ headerShown: true }} />
          <Stack.Screen name="orders/new" options={{ headerShown: true }} />
          <Stack.Screen name="orders/[id]" options={{ headerShown: true }} />
          <Stack.Screen name="customers/new" options={{ headerShown: true }} />
          <Stack.Screen name="products/new" options={{ headerShown: true }} />
          <Stack.Screen name="products/import" options={{ headerShown: true }} />
          <Stack.Screen name="customers/[id]/index" options={{ headerShown: true }} />
          <Stack.Screen name="customers/[id]/edit" options={{ headerShown: true }} />
          <Stack.Screen name="products/[id]/index" options={{ headerShown: true }} />
          <Stack.Screen name="products/[id]/edit" options={{ headerShown: true }} />
          <Stack.Screen name="companies/index" options={{ headerShown: true }} />
          <Stack.Screen name="companies/[companyName]" options={{ headerShown: true }} />
          <Stack.Screen name="reports" options={{ headerShown: true }} />
          <Stack.Screen name="targets" options={{ headerShown: true }} />
          <Stack.Screen name="settings" options={{ headerShown: true }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  errorMessage: {
    textAlign: 'center',
    color: '#666',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#208AEF',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
