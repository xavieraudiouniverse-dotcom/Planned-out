import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.PUSH_CONTACT_EMAIL;
  if (!url || !serviceKey || !publicKey || !privateKey || !contact) return Response.json({ error: 'Reminder delivery needs Supabase and VAPID server secrets.' }, { status: 503 });
  webpush.setVapidDetails(`mailto:${contact}`, publicKey, privateKey);
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  const { data: tasks, error } = await sb.from('planner_tasks').select('id,user_id,title,reminder_at').eq('notify_enabled', true).neq('status', 'done').is('reminder_sent_at', null).lte('reminder_at', now).order('reminder_at').limit(100);
  if (error) return Response.json({ error: 'Could not load due reminders.' }, { status: 500 });
  let sent = 0;
  for (const task of tasks || []) {
    // Claim the row once, even if two scheduled invocations overlap.
    const claimed = await sb.from('planner_tasks').update({ reminder_sent_at: now }).eq('id', task.id).is('reminder_sent_at', null).select('id').maybeSingle();
    if (!claimed.data) continue;
    const { data: subscriptions } = await sb.from('xp_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', task.user_id);
    let delivered = false;
    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: 'Planned Out reminder', body: task.title, taskId: task.id, url: process.env.NEXT_PUBLIC_APP_URL || '/' }), { TTL: 3600 });
        delivered = true; sent++;
      } catch (failure) {
        const code = (failure as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('xp_push_subscriptions').delete().eq('id', subscription.id);
      }
    }
    // An empty or temporarily unavailable subscription must not permanently lose the reminder.
    if (!delivered) await sb.from('planner_tasks').update({ reminder_sent_at: null }).eq('id', task.id).eq('reminder_sent_at', now);
  }
  return Response.json({ due: tasks?.length || 0, sent });
}
