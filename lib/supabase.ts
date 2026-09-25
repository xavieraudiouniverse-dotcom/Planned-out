import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

// Browser-safe public Supabase credentials.
// Row Level Security remains the security boundary.
const FALLBACK_SUPABASE_URL = 'https://mllaiyqyabvbtyachxhh.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_-oMax8Ewcz_llHu2c2jYOQ_dhX7V5a3';

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

export function getSupabaseHost(): string | null {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL);
  return url ? new URL(url).host : null;
}

export function getSupabase() {
  if (client) return client;

  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  const url = normalizeSupabaseUrl(rawUrl);
  if (!url || !key) return null;

  try {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
  } catch {
    return null;
  }

  return client;
}
