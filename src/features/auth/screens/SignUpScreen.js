import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { useAuth } from '@/context/AuthContext';

export function SignUpScreen({ navigation }) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const canSubmit =
    email.trim().length > 3 &&
    password.length >= 6 &&
    password === confirmPassword &&
    !isSubmitting;

  const handleSignUp = async () => {
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setIsSubmitting(true);
    const { error: signUpError } = await signUp(email.trim(), password);
    setIsSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    // If email confirmation is required by the Supabase project's auth
    // settings, there's no session yet — tell the user to check their inbox
    // rather than silently doing nothing. If confirmation is off, the
    // session lands via onAuthStateChange and AppNavigator swaps over.
    setConfirmationSent(true);
  };

  if (confirmationSent) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We've sent a confirmation link to {email.trim()}. Follow it to finish setting up your
            account.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('SignIn')}
            style={[styles.primaryButton, { marginTop: 32 }]}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Text style={styles.primaryButtonText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Aria is ready to help whenever you are</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              accessibilityLabel="Email address"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry
              autoComplete="password-new"
              accessibilityLabel="Password"
            />

            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry
              autoComplete="password-new"
              accessibilityLabel="Confirm password"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
              onPress={handleSignUp}
              disabled={!canSubmit}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.primaryButtonText}>Create account</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('SignIn')}
            style={styles.switchLink}
            accessibilityRole="button"
            accessibilityLabel="Go to sign in"
          >
            <Text style={styles.switchLinkText}>
              Already have an account? <Text style={styles.switchLinkEmphasis}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  title: { ...Typography.displayMedium, color: Colors.textPrimary, textAlign: 'center' },
  subtitle: {
    ...Typography.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  form: { gap: 8 },
  label: { ...Typography.labelMedium, color: Colors.textSecondary, marginTop: 12 },
  input: {
    ...Typography.bodyLarge,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
  },
  error: { ...Typography.bodySmall, color: Colors.error, marginTop: 8 },
  primaryButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { ...Typography.labelLarge, color: Colors.textInverse },
  switchLink: { marginTop: 24, paddingVertical: 8 },
  switchLinkText: { ...Typography.bodyMedium, color: Colors.textSecondary, textAlign: 'center' },
  switchLinkEmphasis: { color: Colors.primary, fontWeight: '600' },
});
