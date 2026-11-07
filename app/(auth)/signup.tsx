import { Link } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Screen, Title, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export default function Signup() {
  const { signUp } = useAuth();
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.includes('@')) return setMsg({ ok: false, text: 'Please enter a valid email.' });
    if (password.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters for your password.' });
    setBusy(true);
    const err = await signUp(email.trim(), password);
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Check your inbox to confirm your email, then log in.' });
  };

  return (
    <Screen>
      <View style={{ height: 40 }} />
      <Title sub="It takes about a minute. Everything else is optional.">Create your space</Title>
      <Card>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
        {msg ? <Txt color={msg.ok ? t.colors.success : t.colors.danger}>{msg.text}</Txt> : null}
        <Button label="Create account" onPress={submit} loading={busy} />
      </Card>
      <Link href="/(auth)/login"><Txt>Already have an account? <Txt color={t.colors.primary} weight="600">Log in</Txt></Txt></Link>
    </Screen>
  );
}
