import { createClient } from '@supabase/supabase-js';
import ical from 'node-ical';

const ALLOWED_HOSTS = new Set(['calendar.google.com', 'www.google.com', 'outlook.live.com', 'outlook.office365.com', 'outlook.office.com', 'outlook.com']);

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return Response.json({ error: 'Sign in to connect a calendar.' }, { status: 401 });
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: identity } = await sb.auth.getUser(token);
  if (!identity.user) return Response.json({ error: 'Sign in again.' }, { status: 401 });
  const input = new URL(request.url);
  const feedId = input.searchParams.get('feedId');
  const from = new Date(input.searchParams.get('from') || '');
  const to = new Date(input.searchParams.get('to') || '');
  if (!feedId || !/^[a-f\d-]{36}$/i.test(feedId) || !Number.isFinite(from.valueOf()) || !Number.isFinite(to.valueOf()) || to <= from || to.valueOf() - from.valueOf() > 50 * 86400000) return Response.json({ error: 'Invalid calendar range.' }, { status: 400 });
  const { data: feed } = await sb.from('xp_calendar_feeds').select('url').eq('id', feedId).eq('user_id', identity.user.id).single();
  if (!feed) return Response.json({ error: 'Calendar not found.' }, { status: 404 });
  let external: URL;
  try { external = new URL(feed.url.replace(/^webcal:\/\//i, 'https://')); }
  catch { return Response.json({ error: 'Invalid calendar address.' }, { status: 400 }); }
  if (external.protocol !== 'https:' || !ALLOWED_HOSTS.has(external.hostname) || external.port || external.username || external.password) return Response.json({ error: 'Use a Google or Outlook iCal address.' }, { status: 400 });
  try {
    const response = await fetch(external, { signal: AbortSignal.timeout(8000), redirect: 'manual', cache: 'no-store' });
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 2_000_000) throw new Error('Calendar feed unavailable or too large.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Calendar feed is empty.');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2_000_000) { await reader.cancel(); throw new Error('Calendar feed is too large.'); }
      chunks.push(value);
    }
    const source = new TextDecoder().decode(Buffer.concat(chunks));
    if (!source.includes('BEGIN:VCALENDAR')) throw new Error('This address did not return an iCal calendar.');
    const parsed = await ical.async.parseICS(source);
    const events = Object.values(parsed).filter((item) => item?.type === 'VEVENT').flatMap((item) => {
      if (!item || item.type !== 'VEVENT' || item.status === 'CANCELLED') return [];
      return ical.expandRecurringEvent(item, { from, to }).map((instance) => ({
        id: `${item.uid}-${instance.start.toISOString()}`,
        title: typeof instance.summary === 'string' ? instance.summary : 'Calendar event',
        starts_at: instance.start.toISOString(),
        ends_at: instance.end?.toISOString() || null,
        all_day: instance.isFullDay
      }));
    }).slice(0, 500);
    return Response.json({ events }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return Response.json({ error: 'Could not load this feed. Check its iCal link and try again.' }, { status: 502 });
  }
}
