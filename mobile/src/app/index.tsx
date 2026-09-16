import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth/AuthContext';

// The root route. It renders nothing itself - it just decides, once session
// hydration finishes, whether to send the user to the dashboard or to sign
// in. Mirrors ProtectedRoute in the web frontend.
export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#208AEF" />
      </View>
    );
  }

  return <Redirect href={user ? '/home' : '/sign-in'} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
