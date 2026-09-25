import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function getSecretKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      if (parsed.default) return parsed.default
      const first = Object.values(parsed).find(Boolean)
      if (first) return first
    } catch {
      // Fall through to legacy service-role key during key migration.
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  throw new Error('Supabase server secret is unavailable.')
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
if (!supabaseUrl) throw new Error('SUPABASE_URL is unavailable.')

const admin = createClient(supabaseUrl, getSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function icsEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldLine(line: string): string {
  const max = 73
  if (new TextEncoder().encode(line).length <= 75) return line
  const chunks: string[] = []
  let current = ''
  for (const char of line) {
    const next = current + char
    if (new TextEncoder().encode(next).length > max && current) {
      chunks.push(current)
      current = char
    } else {
      current = next
    }
  }
  if (current) chunks.push(current)
  return chunks.map((part, index) => index === 0 ? part : ' ' + part).join('\r\n')
}

function ymd(date: string): string {
  return date.replace(/-/g, '')
}

function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const value = new Date(Date.UTC(y, m - 1, d))
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10).replace(/-/g, '')
}

function floatingDateTime(date: string, time: string): string {
  return `${ymd(date)}T${time.slice(0, 5).replace(':', '')}00`
}

function addMinutesFloating(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.slice(0, 5).split(':').map(Number)
  const value = new Date(Date.UTC(y, m - 1, d, hh, mm))
  value.setUTCMinutes(value.getUTCMinutes() + Math.max(1, minutes || 30))
  return {
    date: value.toISOString().slice(0, 10),
    time: value.toISOString().slice(11, 16),
  }
}

function utcStamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function rrule(rule: unknown): string | null {
  const value = String(rule || 'none').toLowerCase()
  if (value === 'daily') return 'RRULE:FREQ=DAILY'
  if (value === 'weekly') return 'RRULE:FREQ=WEEKLY'
  if (value === 'monthly') return 'RRULE:FREQ=MONTHLY'
  if (value === 'yearly') return 'RRULE:FREQ=YEARLY'
  return null
}

function eventLines(lines: string[]): string[] {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT']
}

async function authenticatedUser(req: Request) {
  const header = req.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const { data, error } = await admin.auth.getUser(match[1])
  if (error || !data.user) return null
  return data.user
}

async function renderCalendar(userId: string): Promise<string> {
  const [{ data: tasks, error: taskError }, { data: memberships, error: memberError }, { data: ownedCalendars, error: ownedError }] = await Promise.all([
    admin.from('planner_tasks')
      .select('id,title,notes,start_date,due,start_time,end_time,estimate_minutes,recurrence,status,tags,updated_at')
      .eq('user_id', userId)
      .neq('status', 'done')
      .order('due', { ascending: true }),
    admin.from('xp_calendar_members').select('calendar_id').eq('user_id', userId),
    admin.from('xp_shared_calendars').select('id,name').eq('owner_id', userId),
  ])

  if (taskError) throw taskError
  if (memberError) throw memberError
  if (ownedError) throw ownedError

  const calendarIds = new Set<string>((ownedCalendars || []).map((c) => String(c.id)))
  for (const member of memberships || []) calendarIds.add(String(member.calendar_id))

  let sharedEvents: any[] = []
  let calendarNames = new Map<string, string>((ownedCalendars || []).map((c) => [String(c.id), String(c.name)]))

  if (calendarIds.size) {
    const ids = [...calendarIds]
    const [{ data: events, error: eventError }, { data: calendars, error: calendarError }] = await Promise.all([
      admin.from('xp_shared_calendar_events')
        .select('id,calendar_id,title,starts_at,ends_at,all_day,location,notes,recurrence,updated_at')
        .in('calendar_id', ids)
        .order('starts_at', { ascending: true }),
      admin.from('xp_shared_calendars').select('id,name').in('id', ids),
    ])
    if (eventError) throw eventError
    if (calendarError) throw calendarError
    sharedEvents = events || []
    calendarNames = new Map((calendars || []).map((c) => [String(c.id), String(c.name)]))
  }

  const output: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Planned Out//Unified Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Planned Out',
    'X-WR-CALDESC:Private Planned Out tasks and calendars',
  ]

  for (const task of tasks || []) {
    const startDate = String(task.start_date || task.due)
    const dueDate = String(task.due || startDate)
    const lines = [
      `UID:task-${task.id}@planned-out`,
      `DTSTAMP:${utcStamp(task.updated_at || new Date())}`,
      `SUMMARY:${icsEscape(task.title)}`,
    ]

    if (task.start_time) {
      const startTime = String(task.start_time).slice(0, 5)
      const end = task.end_time
        ? { date: dueDate, time: String(task.end_time).slice(0, 5) }
        : addMinutesFloating(startDate, startTime, Number(task.estimate_minutes || 30))
      lines.push(`DTSTART:${floatingDateTime(startDate, startTime)}`)
      lines.push(`DTEND:${floatingDateTime(end.date, end.time)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(startDate)}`)
      lines.push(`DTEND;VALUE=DATE:${nextDate(dueDate)}`)
    }

    if (task.notes) lines.push(`DESCRIPTION:${icsEscape(task.notes)}`)
    if (Array.isArray(task.tags) && task.tags.length) lines.push(`CATEGORIES:${icsEscape(task.tags.filter(Boolean).join(', '))}`)
    const repeat = rrule(task.recurrence)
    if (repeat) lines.push(repeat)
    output.push(...eventLines(lines))
  }

  for (const item of sharedEvents) {
    const calendarName = calendarNames.get(String(item.calendar_id)) || 'Shared calendar'
    const lines = [
      `UID:shared-${item.id}@planned-out`,
      `DTSTAMP:${utcStamp(item.updated_at || new Date())}`,
      `SUMMARY:${icsEscape(item.title)}`,
      `CATEGORIES:${icsEscape(calendarName)}`,
    ]

    if (item.all_day) {
      const start = new Date(item.starts_at).toISOString().slice(0, 10)
      const end = item.ends_at ? new Date(item.ends_at).toISOString().slice(0, 10) : start
      lines.push(`DTSTART;VALUE=DATE:${ymd(start)}`)
      lines.push(`DTEND;VALUE=DATE:${nextDate(end)}`)
    } else {
      lines.push(`DTSTART:${utcStamp(item.starts_at)}`)
      if (item.ends_at) lines.push(`DTEND:${utcStamp(item.ends_at)}`)
    }

    if (item.location) lines.push(`LOCATION:${icsEscape(item.location)}`)
    if (item.notes) lines.push(`DESCRIPTION:${icsEscape(item.notes)}`)
    const repeat = rrule(item.recurrence)
    if (repeat) lines.push(repeat)
    output.push(...eventLines(lines))
  }

  output.push('END:VCALENDAR')
  return output.map(foldLine).join('\r\n') + '\r\n'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const token = url.searchParams.get('token') || ''
      if (token.length < 32 || token.length > 256) {
        return new Response('Calendar link is invalid.', { status: 400 })
      }

      const tokenHash = await sha256Hex(token)
      const { data: record, error } = await admin
        .from('xp_calendar_export_tokens')
        .select('user_id')
        .eq('token_hash', tokenHash)
        .eq('active', true)
        .maybeSingle()

      if (error) throw error
      if (!record) return new Response('Calendar link is unavailable.', { status: 404 })

      const calendar = await renderCalendar(String(record.user_id))
      return new Response(calendar, {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'inline; filename="planned-out.ics"',
          'Cache-Control': 'private, no-store, max-age=0',
        },
      })
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

    const user = await authenticatedUser(req)
    if (!user) return json({ error: 'Sign in first.' }, 401)

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : 'status'

    if (action === 'status') {
      const { data, error } = await admin
        .from('xp_calendar_export_tokens')
        .select('id,created_at')
        .eq('user_id', user.id)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return json({ active: Boolean(data), createdAt: data?.created_at || null })
    }

    if (action === 'create') {
      await admin.from('xp_calendar_export_tokens')
        .update({ active: false, revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('active', true)

      const token = randomToken()
      const tokenHash = await sha256Hex(token)
      const { error } = await admin.from('xp_calendar_export_tokens')
        .insert({ user_id: user.id, token_hash: tokenHash, label: 'Primary calendar feed' })
      if (error) throw error

      const feedUrl = `${supabaseUrl}/functions/v1/calendar-export?token=${encodeURIComponent(token)}`
      return json({ active: true, url: feedUrl })
    }

    if (action === 'revoke') {
      const { error } = await admin.from('xp_calendar_export_tokens')
        .update({ active: false, revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('active', true)
      if (error) throw error
      return json({ active: false })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected calendar error.' }, 500)
  }
})
