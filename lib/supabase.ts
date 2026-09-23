import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

// The env var may arrive without a scheme or with a trailing REST path
// (e.g. "project.supabase.co/rest/v1"); normalize it to a bare origin.
function normalizeSupabaseUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getSupabase() {
  if (client) return client;
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!rawUrl || !key) return null;
  const url = normalizeSupabaseUrl(rawUrl);
  if (!url) return null;
  try {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch {
    return null;
  }
  return client;
}
