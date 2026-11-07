import { Link } from 'expo-router';
import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Screen, Title, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export default function Forgot() {
  const { resetPassword } = useAuth();
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <Title sub="We'll email you a link to set a new one.">Reset password</Title>
      <Card>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        {msg ? <Txt color={t.colors.textMuted}>{msg}</Txt> : null}
        <Button label="Send reset link" loading={busy} onPress={async () => {
          setBusy(true); const e = await resetPassword(email.trim()); setBusy(false);
          setMsg(e ?? 'If that email has an account, a reset link is on its way.');
        }} />
      </Card>
      <Link href="/(auth)/login"><Txt color={t.colors.primary}>Back to log in</Txt></Link>
    </Screen>
  );
}
