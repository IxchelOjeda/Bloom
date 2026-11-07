/** Private photo attached to a row (receipt, wishlist item). Shown via a short-lived signed URL. */
import React, { useEffect, useState } from 'react';
import { Alert, Image, Platform, View } from 'react-native';
import { pickImage, removeFile, signedUrl } from '@/lib/storage';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Row, Txt } from './ui';

export function Thumb({ path, size = 56 }: { path: string | null | undefined; size?: number }) {
  const t = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let alive = true; if (path) void signedUrl(path).then((u) => alive && setUrl(u)); else setUrl(null); return () => { alive = false; }; }, [path]);
  if (!path) return null;
  return <View style={{ width: size, height: size, borderRadius: t.radius.sm, overflow: 'hidden', backgroundColor: t.colors.surfaceAlt }}>
    {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors accessibilityLabel="Attached photo" /> : null}
  </View>;
}

export function ImageField({ label, value, onChange, prefix }: { label: string; value: string | null; onChange: (p: string | null) => void; prefix: 'receipt' | 'wishlist' }) {
  const [busy, setBusy] = useState(false);
  const pick = async (source: 'library' | 'camera') => {
    setBusy(true);
    try { const f = await pickImage(prefix, source); if (f) { if (value) void removeFile(value); onChange(f.path); } }
    catch (e) { Alert.alert('Could not add the photo', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} muted>{label}</Txt>
      <Row wrap>
        <Thumb path={value} size={72} />
        {Platform.OS === 'web' ? <Txt size={12} muted>Add photos from the phone app.</Txt> : (<>
          <Button small kind="secondary" icon="camera-outline" label="Camera" loading={busy} onPress={() => void pick('camera')} />
          <Button small kind="secondary" icon="images-outline" label="Library" loading={busy} onPress={() => void pick('library')} />
        </>)}
        {value ? <Button small kind="ghost" label="Remove" onPress={() => { void removeFile(value); onChange(null); }} /> : null}
      </Row>
    </View>
  );
}
