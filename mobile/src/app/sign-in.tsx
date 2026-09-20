import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth/AuthContext';

export default function SignIn() {
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Order Booking</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username"
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            textContentType="password"
            autoComplete="password"
          />
          <Pressable
            style={styles.eyeButton}
            onPress={() => setShowPassword((current) => !current)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#5b6472" />
          </Pressable>
        </View>

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}>
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </TouchableOpacity>

        <Link href="/sign-up" style={styles.link}>
          Don&apos;t have an account? Sign up
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', color: '#1a2233' },
  subtitle: { fontSize: 15, textAlign: 'center', color: '#5b6472', marginTop: 6, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#3a4250', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#d5dae1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fb',
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingRight: 48 },
  eyeButton: { position: 'absolute', right: 0, height: '100%', justifyContent: 'center', paddingHorizontal: 12 },
  button: {
    backgroundColor: '#208AEF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 20, textAlign: 'center', color: '#208AEF', fontSize: 14 },
  errorBox: {
    backgroundColor: '#fdecec',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  errorText: { color: '#b3261e', fontSize: 14 },
});
