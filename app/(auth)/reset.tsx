import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Screen, Title, Txt } from '@/components/ui';

/** Opened from the password-reset email deep link (orchid://(auth)/reset#access_token=…). */
export default function Reset() {
  const { updatePassword } = useAuth();
  const url = Linking.useURL();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    const frag = new URLSearchParams(url.split('#')[1] ?? '');
    const access_token = frag.get('access_token'), refresh_token = frag.get('refresh_token');
    if (access_token && refresh_token) void supabase.auth.setSession({ access_token, refresh_token });
  }, [url]);

  return (
    <Screen>
      <Title>Choose a new password</Title>
      <Card>
        <Field label="New password" secureTextEntry value={pw} onChangeText={setPw} textContentType="newPassword" />
        {msg ? <Txt>{msg}</Txt> : null}
        <Button label="Save password" onPress={async () => {
          if (pw.length < 8) return setMsg('Use at least 8 characters.');
          const e = await updatePassword(pw);
          if (e) setMsg(e); else router.replace('/');
        }} />
      </Card>
    </Screen>
  );
}
