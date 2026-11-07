/**
 * Private file storage (Supabase Storage bucket "private"). Files are stored flat under
 * "<user id>/" — the storage RLS policy only allows that folder, and account deletion
 * removes it. Files are shown through short-lived signed URLs, never public links.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { newId } from './db';
import { supabase } from './supabase';

export interface StoredFile { path: string; name: string; mime: string; size: number | null }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** base64 → bytes (no dependency on atob/Buffer, which differ between engines). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0, bits = 0, j = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | B64.indexOf(clean[i]); bits += 6;
    if (bits >= 8) { bits -= 8; out[j++] = (buf >> bits) & 0xff; }
  }
  return out.subarray(0, j);
}

const MAX_BYTES = 10 * 1024 * 1024;

async function upload(uri: string, name: string, mime: string, size: number | null, prefix: string): Promise<StoredFile> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  if (size && size > MAX_BYTES) throw new Error('That file is over 10 MB.');
  const ext = (name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const path = `${u.user.id}/${prefix}-${newId()}.${ext}`;
  const body = Platform.OS === 'web'
    ? await (await fetch(uri)).blob()
    : base64ToBytes(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }));
  const { error } = await supabase.storage.from('private').upload(path, body, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  return { path, name, mime, size };
}

/** Pick a photo (library or camera) and upload it. Returns null if the person cancels. */
export async function pickImage(prefix: 'receipt' | 'wishlist' | 'attachment', source: 'library' | 'camera' = 'library'): Promise<StoredFile | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(source === 'camera' ? 'Camera access is off for Orchid in your settings.' : 'Photo access is off for Orchid in your settings.');
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return upload(a.uri, a.fileName ?? 'photo.jpg', a.mimeType ?? 'image/jpeg', a.fileSize ?? null, prefix);
}

/** Pick any document (PDF, image, text…) and upload it. */
export async function pickDocument(prefix: 'attachment' | 'receipt' = 'attachment'): Promise<StoredFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return upload(a.uri, a.name, a.mimeType ?? 'application/octet-stream', a.size ?? null, prefix);
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data } = await supabase.storage.from('private').createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60000 });
  return data.signedUrl;
}

export async function removeFile(path: string) {
  urlCache.delete(path);
  await supabase.storage.from('private').remove([path]);
}
