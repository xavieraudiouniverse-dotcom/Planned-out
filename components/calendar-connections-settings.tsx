'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

type CalendarFeed = {
  id: string;
  user_id: string;
  name: string;
  url: string;
  created_at?: string;
};

const KNOWN_HOSTS = new Set([
  'calendar.google.com',
  'www.google.com',
  'outlook.live.com',
  'outlook.office365.com',
  'outlook.office.com',
  'outlook.com',
  'caldav.icloud.com'
]);

function isSupportedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return KNOWN_HOSTS.has(host) || /^p\d+-caldav\.icloud\.com$/.test(host);
}

function normaliseFeedUrl(raw: string) {
  return new URL(raw.trim().replace(/^webcal:\/\//i, 'https://'));
}

function providerLabel(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('google')) return 'Google Calendar';
    if (host.includes('outlook') || host.includes('office')) return 'Outlook / Microsoft';
    if (host.includes('icloud')) return 'Apple / iCloud';
  } catch {
    // Fall through to the generic label.
  }
  return 'External calendar';
}

export function CalendarConnectionsSettings({
  user,
  onRequestSignIn
}: {
  user: User | null;
  onRequestSignIn: () => void;
}) {
  const sb = useMemo(() => getSupabase(), []);
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [feedName, setFeedName] = useState('Google Calendar');
  const [feedUrl, setFeedUrl] = useState('');
  const [exportActive, setExportActive] = useState(false);
  const [exportUrl, setExportUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const notify = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 6000);
  }, []);

  const exportStorageKey = user ? `planned-out-calendar-export-url:${user.id}` : '';

  const refresh = useCallback(async () => {
    if (!sb || !user) {
      setFeeds([]);
      setExportActive(false);
      setExportUrl('');
      return;
    }

    const { data, error } = await sb
      .from('xp_calendar_feeds')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      notify(error.message);
      return;
    }

    setFeeds((data || []) as CalendarFeed[]);

    const saved = localStorage.getItem(`planned-out-calendar-export-url:${user.id}`) || '';
    setExportUrl(saved);

    const result = await sb.functions.invoke('calendar-export', { body: { action: 'status' } });
    if (result.error) {
      notify(result.error.message);
      return;
    }

    setExportActive(Boolean(result.data?.active));
    if (!result.data?.active && saved) {
      localStorage.removeItem(`planned-out-calendar-export-url:${user.id}`);
      setExportUrl('');
    }
  }, [notify, sb, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sb || !user) return onRequestSignIn();

    let candidate: URL;
    try {
      candidate = normaliseFeedUrl(feedUrl);
    } catch {
      return notify('Paste a valid iCal subscription address.');
    }

    if (
      candidate.protocol !== 'https:' ||
      candidate.port ||
      candidate.username ||
      candidate.password ||
      !isSupportedHost(candidate.hostname)
    ) {
      return notify('Use a Google, Outlook/Microsoft, or Apple/iCloud iCal subscription link.');
    }

    setBusy(true);
    const { error } = await sb.from('xp_calendar_feeds').insert({
      user_id: user.id,
      name: feedName.trim() || providerLabel(candidate.toString()),
      url: candidate.toString()
    });
    setBusy(false);

    if (error) {
      return notify(error.code === '23505' ? 'That calendar is already connected.' : error.message);
    }

    setFeedUrl('');
    await refresh();
    notify('Calendar connected to Planned Out.');
  }

  async function removeFeed(id: string) {
    if (!sb || !user) return;
    setBusy(true);
    const { error } = await sb.from('xp_calendar_feeds').delete().eq('id', id).eq('user_id', user.id);
    setBusy(false);
    if (error) return notify(error.message);
    await refresh();
    notify('Calendar disconnected.');
  }

  async function createExport() {
    if (!sb || !user) return onRequestSignIn();
    setBusy(true);
    const result = await sb.functions.invoke('calendar-export', { body: { action: 'create' } });
    setBusy(false);

    if (result.error || !result.data?.url) {
      return notify(result.error?.message || 'Could not create the private calendar link.');
    }

    const url = String(result.data.url);
    localStorage.setItem(exportStorageKey, url);
    setExportUrl(url);
    setExportActive(true);

    try {
      await navigator.clipboard.writeText(url);
      notify('New private subscription link created and copied.');
    } catch {
      notify('New private subscription link created.');
    }
  }

  async function copyExport() {
    if (!exportUrl) return notify('Regenerate the private link first on this device.');
    await navigator.clipboard.writeText(exportUrl);
    notify('Private calendar link copied.');
  }

  async function revokeExport() {
    if (!sb || !user) return;
    setBusy(true);
    const result = await sb.functions.invoke('calendar-export', { body: { action: 'revoke' } });
    setBusy(false);
    if (result.error) return notify(result.error.message);

    localStorage.removeItem(exportStorageKey);
    setExportUrl('');
    setExportActive(false);
    notify('Private calendar link revoked.');
  }

  if (!user) {
    return <div>
      <p className="reminder-help">Sign in to connect external calendars and create your private Planned Out subscription link.</p>
      <button className="primary" onClick={onRequestSignIn}>Sign in to calendar settings</button>
    </div>;
  }

  return <div>
    {message && <div className="notice">{message}</div>}

    <div className="grid two">
      <div>
        <p className="eyebrow">PLANNED OUT → OTHER CALENDARS</p>
        <h3>Private subscription link</h3>
        <p className="reminder-help">This publishes your active Planned Out tasks plus shared calendars you currently own or can access. Treat the link like a password. Regenerating it revokes the old one.</p>
        <span className={`push-status ${exportActive ? 'granted' : 'default'}`}><i />{exportActive ? 'Private calendar feed active' : 'No private calendar feed'}</span>
        {exportUrl && <label className="field"><span>Your private subscription URL</span><input value={exportUrl} readOnly onFocus={(event) => event.currentTarget.select()} /></label>}
        {exportActive && !exportUrl && <p className="reminder-help">A link is active, but this device does not have its secret copy. Regenerate it to receive a new URL.</p>}
        <div className="push-actions">
          <button className="primary" disabled={busy} onClick={() => void createExport()}>{exportActive ? 'Regenerate private link' : 'Generate private link'}</button>
          <button disabled={busy || !exportUrl} onClick={() => void copyExport()}>Copy link</button>
          <button disabled={busy || !exportActive} onClick={() => void revokeExport()}>Revoke link</button>
        </div>
      </div>

      <div>
        <p className="eyebrow">OTHER CALENDARS → PLANNED OUT</p>
        <h3>Import subscription feeds</h3>
        <p className="reminder-help">Connect a private or published iCal address from Google Calendar, Outlook/Microsoft, or Apple/iCloud. Imported feeds remain read-only inside Planned Out.</p>
        <form onSubmit={addFeed}>
          <label className="field"><span>Calendar name</span><input value={feedName} onChange={(event) => setFeedName(event.target.value)} placeholder="Work calendar" required /></label>
          <label className="field"><span>Private / published iCal URL</span><input value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="webcal://… or https://…" required /></label>
          <button className="primary" disabled={busy}>Connect calendar</button>
        </form>
      </div>
    </div>

    <div style={{ marginTop: 18 }}>
      <p className="eyebrow">CONNECTED SOURCES</p>
      {feeds.length === 0 ? <p className="reminder-help">No external calendar feeds connected yet.</p> : feeds.map((feed) => <div className="calendar-source" key={feed.id}>
        <span className="calendar-source-icon">↗</span>
        <div><b>{feed.name}</b><small>{providerLabel(feed.url)} · read-only import</small></div>
        <button type="button" disabled={busy} aria-label={`Disconnect ${feed.name}`} onClick={() => void removeFeed(feed.id)}>×</button>
      </div>)}
    </div>

    <div style={{ marginTop: 18 }}>
      <p className="eyebrow">WHERE THE PRIVATE LINK WORKS</p>
      <div className="module-grid">
        <div className="module-card"><span>G</span><b>Google Calendar</b><small>Add the private URL as a calendar subscription.</small></div>
        <div className="module-card"><span>O</span><b>Outlook / Microsoft</b><small>Use Subscribe from web so updates continue automatically.</small></div>
        <div className="module-card"><span></span><b>Apple / iCloud</b><small>Add it as a subscribed calendar on Apple devices.</small></div>
        <div className="module-card"><span>S</span><b>Samsung Calendar</b><small>Use the synced Google or Outlook account on the Android device.</small></div>
        <div className="module-card"><span>T</span><b>TimeTree</b><small>TimeTree can display external calendars that are synced into the device calendar.</small></div>
      </div>
    </div>
  </div>;
}
