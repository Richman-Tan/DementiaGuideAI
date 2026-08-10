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

export function SignInScreen({ navigation }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !isSubmitting;

  const handleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setIsSubmitting(false);
    if (signInError) setError(signInError);
    // On success, AuthContext's session state flips and AppNavigator swaps
    // screens automatically — nothing to navigate to here.
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to continue with Aria</Text>

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
              placeholder="••••••••"
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry
              autoComplete="password"
              accessibilityLabel="Password"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
              onPress={handleSignIn}
              disabled={!canSubmit}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.primaryButtonText}>Sign in</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('SignUp')}
            style={styles.switchLink}
            accessibilityRole="button"
            accessibilityLabel="Go to sign up"
          >
            <Text style={styles.switchLinkText}>
              Don't have an account? <Text style={styles.switchLinkEmphasis}>Sign up</Text>
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
