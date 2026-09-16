import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { register } from '@/lib/api/auth';
import { useAuth } from '@/lib/auth/AuthContext';

const MIN_PASSWORD_LENGTH = 8;

const EMPTY_FORM = {
  companyName: '',
  name: '',
  username: '',
  password: '',
  confirmPassword: '',
  phone: '',
};

function validate(values: typeof EMPTY_FORM) {
  if (!values.companyName.trim()) return 'Enter your company name — it appears on the app and on order receipts.';
  if (!values.name.trim()) return "Enter the booker's full name.";
  if (!values.username.trim()) return 'Choose a username.';
  if (values.password.length < MIN_PASSWORD_LENGTH) {
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (values.password !== values.confirmPassword) return 'The two passwords do not match.';
  return null;
}

export default function SignUp() {
  const { adoptSession } = useAuth();

  const [values, setValues] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(field: keyof typeof EMPTY_FORM) {
    return (text: string) => setValues((current) => ({ ...current, [field]: text }));
  }

  async function handleSubmit() {
    setError(null);

    const problem = validate(values);
    if (problem) {
      setError(problem);
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await register({
        name: values.name.trim(),
        username: values.username.trim(),
        password: values.password,
        companyName: values.companyName.trim(),
        phone: values.phone.trim() || undefined,
      });

      await adoptSession(data.token, data.user);
      router.replace('/home');
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
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          Your company name brands the app and every order receipt it prints. Everything you add is
          private to your account.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.label}>Company name</Text>
        <TextInput
          style={styles.input}
          value={values.companyName}
          onChangeText={handleChange('companyName')}
          placeholder="e.g. Al-Noor Distributors"
        />

        <Text style={styles.label}>Full name</Text>
        <TextInput style={styles.input} value={values.name} onChangeText={handleChange('name')} />

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={values.username}
          onChangeText={handleChange('username')}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Contact number (optional)</Text>
        <TextInput
          style={styles.input}
          value={values.phone}
          onChangeText={handleChange('phone')}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={values.password}
          onChangeText={handleChange('password')}
          secureTextEntry
        />

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          style={styles.input}
          value={values.confirmPassword}
          onChangeText={handleChange('confirmPassword')}
          secureTextEntry
        />

        <Text style={styles.note}>
          At least {MIN_PASSWORD_LENGTH} characters. There is no password reset in this application, so
          keep it somewhere safe.
        </Text>

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}>
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create account</Text>
          )}
        </TouchableOpacity>

        <Link href="/sign-in" style={styles.link}>
          I already have an account
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', color: '#1a2233' },
  subtitle: { fontSize: 14, textAlign: 'center', color: '#5b6472', marginTop: 8, marginBottom: 20 },
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
  note: { fontSize: 12, color: '#5b6472', marginTop: 14 },
  button: {
    backgroundColor: '#208AEF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 20, textAlign: 'center', color: '#208AEF', fontSize: 14 },
  errorBox: { backgroundColor: '#fdecec', borderRadius: 8, padding: 12, marginBottom: 8 },
  errorText: { color: '#b3261e', fontSize: 14 },
});
