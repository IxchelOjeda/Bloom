// Permanently deletes the calling user. Every table references auth.users ON DELETE CASCADE,
// so this one admin call removes all their rows; storage files are removed first.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { cors, json, userClient } from '../_shared/ai.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const u = await userClient(req);
  if (u instanceof Response) return u;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // remove private files under <uid>/ (uploads are stored flat in that folder), page by page
  for (;;) {
    const { data: files, error } = await admin.storage.from('private').list(u.userId, { limit: 1000 });
    if (error) return json({ error: `Could not remove your files: ${error.message}` }, 500);
    if (!files?.length) break;
    const { error: rmErr } = await admin.storage.from('private').remove(files.map((f) => `${u.userId}/${f.name}`));
    if (rmErr) return json({ error: `Could not remove your files: ${rmErr.message}` }, 500);
  }

  const { error } = await admin.auth.admin.deleteUser(u.userId);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
