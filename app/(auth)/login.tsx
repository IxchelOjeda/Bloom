import { Link } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Screen, Title, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export default function Login() {
  const { signIn } = useAuth();
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.includes('@') || password.length < 6) { setError('Enter your email and a password of at least 6 characters.'); return; }
    setBusy(true); setError(await signIn(email.trim(), password)); setBusy(false);
  };

  return (
    <Screen>
      <View style={{ height: 40 }} />
      <Title sub="Your life, gently organized.">Welcome back</Title>
      <Card>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" />
        {error ? <Txt color={t.colors.danger}>{error}</Txt> : null}
        <Button label="Log in" onPress={submit} loading={busy} />
      </Card>
      <Link href="/(auth)/forgot"><Txt color={t.colors.primary}>Forgot password?</Txt></Link>
      <Link href="/(auth)/signup"><Txt>New here? <Txt color={t.colors.primary} weight="600">Create an account</Txt></Txt></Link>
    </Screen>
  );
}
