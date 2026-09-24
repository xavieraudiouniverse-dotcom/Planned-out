import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

export const PLANNED_OUT_VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BHq-nYJk4haPLUqTwes05YqT_m7f5IyebsJnPxEQZBo9QWmXLmkUcBWeLffY_UaXIHcwdB38128g3Gl_vLzIHf4';

function toApplicationServerKey(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export async function registerPushWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/planned-out-sw.js', { scope: '/' });
}

export async function enablePushNotifications(user: User) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('This browser does not support web push notifications.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const registration = await registerPushWorker();
  if (!registration) throw new Error('Could not register the Planned Out notification worker.');

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await sb.from('xp_push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', existing.endpoint);
    await existing.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toApplicationServerKey(PLANNED_OUT_VAPID_PUBLIC_KEY)
  });

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error('Browser did not return push encryption keys.');

  const { error } = await sb.from('xp_push_subscriptions').upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent,
    updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });

  if (error) {
    await subscription.unsubscribe();
    throw error;
  }
  return permission;
}

export async function disablePushNotifications(user: User) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await sb.from('xp_push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
}
