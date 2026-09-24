'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { instantBreakdown, qwenOrLlamaBreakdown } from '@/lib/ai';
import { AssistantPanel, type AssistantContext } from '@/components/assistant-panel';
import { CollaborativeCalendar } from '@/components/collaborative-calendar';
import { plannerLevels, type AppState, type AppView, type ModuleName, type ModuleRecord, type PlannerFile, type PlannerLevel, type PlannerTask, type Priority, type Status } from '@/lib/types';

const STORAGE_KEY = 'xavier-planner-os-ultimate-v2';
const MEMORY_KEY = 'xavier-planner-os-memory-v1';
const todayKey = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const views: Array<{ id: AppView; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Command', icon: '⌘' },
  { id: 'planner', label: 'Planner', icon: '◷' },
  { id: 'calendar', label: 'Calendar', icon: '▦' },
  { id: 'board', label: 'Board', icon: '▥' },
  { id: 'focus', label: 'Focus', icon: '◎' },
  { id: 'files', label: 'Vault', icon: '▣' },
  { id: 'knowledge', label: 'Knowledge', icon: '✦' },
  { id: 'habits', label: 'Habits', icon: '↻' },
  { id: 'journal', label: 'Journal', icon: '✎' },
  { id: 'finance', label: 'Finance', icon: '$' },
  { id: 'health', label: 'Health', icon: '✚' },
  { id: 'learning', label: 'Learning', icon: '⌁' },
  { id: 'travel', label: 'Travel', icon: '⌖' },
  { id: 'contacts', label: 'People', icon: '◉' },
  { id: 'analytics', label: 'Analytics', icon: '▧' },
  { id: 'templates', label: 'Templates', icon: '◫' },
  { id: 'settings', label: 'Settings', icon: '⚙' }
];

const moduleMap: Partial<Record<AppView, ModuleName>> = {
  knowledge: 'knowledge', habits: 'habit', journal: 'journal', finance: 'finance', health: 'health', learning: 'learning', travel: 'travel', contacts: 'contact'
};

const modules: Array<{ module: ModuleName; title: string; icon: string; description: string; fields: string[] }> = [
  { module: 'knowledge', title: 'Knowledge Base', icon: '✦', description: 'Notes, wiki pages, research, bookmarks, meetings, PDF summaries and whiteboards.', fields: ['source', 'summary', 'nextAction'] },
  { module: 'habit', title: 'Habit Engine', icon: '↻', description: 'Daily, weekly and monthly streaks with targets, logs, health routines and review prompts.', fields: ['cadence', 'target', 'unit'] },
  { module: 'journal', title: 'Journal + Review', icon: '✎', description: 'Daily reflection, gratitude, wins, lessons, energy, mood and AI review input.', fields: ['mood', 'energy', 'win'] },
  { module: 'finance', title: 'Finance Tracker', icon: '$', description: 'Budgets, subscriptions, income, savings, debts, bills, receipts and launch costs.', fields: ['amount', 'currency', 'recurring'] },
  { module: 'health', title: 'Health Planner', icon: '✚', description: 'Symptoms, appointments, medication reminders, meals, fitness and recovery notes.', fields: ['metric', 'value', 'doctor'] },
  { module: 'learning', title: 'Learning OS', icon: '⌁', description: 'Courses, skills, reading lists, research, certificates, assignments and revision.', fields: ['skill', 'resource', 'progress'] },
  { module: 'travel', title: 'Travel Planner', icon: '⌖', description: 'Trips, bookings, packing lists, maps, documents, budgets and itineraries.', fields: ['destination', 'booking', 'passport'] },
  { module: 'contact', title: 'People CRM', icon: '◉', description: 'Contacts, birthdays, anniversaries, roles, follow-ups, notes and relationship history.', fields: ['email', 'phone', 'birthday'] },
  { module: 'vault', title: 'Digital Vault', icon: '▣', description: 'Important documents, IDs, warranties, receipts, licenses and certificates.', fields: ['expiry', 'documentType', 'secureNote'] },
  { module: 'automation', title: 'Automation Lab', icon: '⚡', description: 'Workflow rules, reminders, review cycles, project checks and smart nudges.', fields: ['trigger', 'action', 'frequency'] },
  { module: 'risk', title: 'Risk Register', icon: '⚠', description: 'Risks, issues, blockers, dependencies, owners and mitigation plans.', fields: ['impact', 'likelihood', 'mitigation'] },
  { module: 'subscription', title: 'Subscription Watch', icon: '◌', description: 'Subscriptions, renewals, cancellations, trial endings and budget forecasting.', fields: ['amount', 'renews', 'cancelLink'] }
];

const templates = [
  { name: '10 Year Vision → Today', category: 'Life OS', details: 'Life areas, decade vision, yearly goals, quarterly milestones, monthly outcomes, weekly actions and daily focus blocks.' },
  { name: 'Business Launch War Room', category: 'Business', details: 'Roadmap, budget, contacts, content, file vault, risks, tasks, analytics and daily launch actions.' },
  { name: 'Health Recovery System', category: 'Health', details: 'Appointments, medication, symptoms, meals, habits, journal, attachments and doctor questions.' },
  { name: 'Study + Skill Builder', category: 'Learning', details: 'Course plan, reading tracker, revision schedule, assignments, files, notes and progress.' },
  { name: 'Travel Command Centre', category: 'Travel', details: 'Bookings, itinerary, packing, documents, budget, contacts, maps and daily agenda.' },
  { name: 'Family Life Planner', category: 'Home', details: 'Birthdays, bills, school, meals, appointments, chores, documents and shared goals.' }
];

function blankTask(level: PlannerLevel = 'daily', parentId: string | null = null): PlannerTask {
  const date = todayKey();
  return { id: uid(), parentId, title: '', notes: '', level, startDate: date, dueDate: date, startTime: '', endTime: '', priority: 'medium', status: 'planned', area: 'Life', estimateMinutes: 60, tags: [], links: [], createdAt: now(), updatedAt: now() };
}

function blankRecord(module: ModuleName): ModuleRecord {
  return { id: uid(), module, title: '', body: '', date: todayKey(), category: module, status: 'active', tags: [], data: {}, createdAt: now(), updatedAt: now() };
}

function seedState(): AppState {
  const y = blankTask('yearly'); y.title = 'Build Xavier Planner OS Ultimate'; y.notes = 'A life operating system with files, AI, projects, habits, knowledge, finance, health, learning and analytics.'; y.priority = 'urgent'; y.area = 'Business'; y.tags = ['xavier', 'launch'];
  const m = blankTask('monthly', y.id); m.title = 'Finish the production-ready planner foundation'; m.notes = 'Database, attachments, mobile UI, templates and AI planning support.'; m.priority = 'high'; m.area = 'Business';
  const w = blankTask('weekly', m.id); w.title = 'Prepare Vercel deployment and test the core workflow'; w.status = 'active'; w.area = 'Business';
  const d = blankTask('daily', w.id); d.title = 'Create first goals, attach files, run AI breakdown and export backup'; d.area = 'Business'; d.startTime = '09:00'; d.endTime = '10:30';
  return {
    tasks: [y, m, w, d],
    files: [],
    records: [
      { ...blankRecord('knowledge'), title: 'Planner principle', body: 'Everything connects: goals, tasks, files, people, notes, time, money and health.', tags: ['operating-system'] },
      { ...blankRecord('habit'), title: 'Morning command review', body: 'Open dashboard, choose one priority, check deadlines, plan focus blocks.', data: { cadence: 'daily', target: 1, unit: 'review' } },
      { ...blankRecord('finance'), title: 'Launch budget watch', body: 'Track software, domains, storage, AI costs and revenue.', amount: 0, data: { currency: 'AUD' } },
      { ...blankRecord('journal'), title: 'Daily review', body: 'What moved forward today? What needs to change tomorrow?', data: { mood: 7, energy: 7 } }
    ],
    theme: 'midnight',
    density: 'comfortable',
    lastView: 'dashboard'
  };
}

function safeRead(): AppState {
  if (typeof window === 'undefined') return seedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const seed = seedState();
    return { tasks: parsed.tasks || seed.tasks, files: parsed.files || [], records: parsed.records || seed.records, theme: parsed.theme || 'midnight', density: parsed.density || 'comfortable', lastView: parsed.lastView || 'dashboard' };
  } catch { return seedState(); }
}

function percentDone(tasks: PlannerTask[]) { return tasks.length ? Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100) : 0; }
function childrenOf(tasks: PlannerTask[], id: string) { return tasks.filter((task) => task.parentId === id); }
function lineage(tasks: PlannerTask[], task: PlannerTask) { const result: PlannerTask[] = []; let cursor: PlannerTask | undefined = task; const seen = new Set<string>(); while (cursor?.parentId && !seen.has(cursor.parentId)) { seen.add(cursor.parentId); const parent = tasks.find((item) => item.id === cursor?.parentId); if (!parent) break; result.unshift(parent); cursor = parent; } return result; }
function dateLabel(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
function levelLabel(level: PlannerLevel) { return level[0].toUpperCase() + level.slice(1); }
function moduleTitle(module: ModuleName) { return modules.find((item) => item.module === module)?.title || module; }
function unique<T>(items: T[]) { return [...new Set(items)]; }

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Pill({ children, tone = '' }: { children: React.ReactNode; tone?: string }) { return <span className={`pill ${tone}`}>{children}</span>; }

export function UltimatePlanner() {
  const sb = useMemo(() => getSupabase(), []);
  const [state, setState] = useState<AppState>(() => seedState());
  const [view, setView] = useState<AppView>('dashboard');
  const [query, setQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskModal, setTaskModal] = useState(false);
  const [recordModal, setRecordModal] = useState<ModuleName | null>(null);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [taskForm, setTaskForm] = useState<PlannerTask>(() => blankTask('daily'));
  const [recordForm, setRecordForm] = useState<ModuleRecord>(() => blankRecord('knowledge'));
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [aiProgress, setAiProgress] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ModuleName>('knowledge');
  const [memory, setMemory] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const backupInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => { const loaded = safeRead(); setState(loaded); setView(loaded.lastView); }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { const raw = localStorage.getItem(MEMORY_KEY); if (raw) setMemory(JSON.parse(raw) as string[]); } catch { /* ignore */ }
  }, []);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem(MEMORY_KEY, JSON.stringify(memory)); }, [memory]);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastView: view })); }, [state, view]);
  useEffect(() => {
    if (!sb) return;
    void sb.auth.getUser().then(({ data }) => { setUser(data.user); if (data.user) void loadCloud(data.user.id); });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); if (session?.user) void loadCloud(session.user.id); });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const selectedTask = state.tasks.find((task) => task.id === selectedTaskId) || null;
  const filteredTasks = useMemo(() => state.tasks.filter((task) => [task.title, task.notes, task.level, task.area, ...task.tags].join(' ').toLowerCase().includes(query.toLowerCase())), [state.tasks, query]);
  const overdue = state.tasks.filter((task) => task.status !== 'done' && task.dueDate < todayKey()).length;
  const activeFiles = state.files.filter((file) => !selectedTask || file.taskId === selectedTask.id);
  const visibleRecords = useMemo(() => state.records.filter((record) => {
    const module = moduleMap[view] || selectedModule;
    const matchesModule = record.module === module || view === 'dashboard' || view === 'analytics' || view === 'templates' || view === 'settings';
    const text = [record.title, record.body, record.category, record.status, ...record.tags].join(' ').toLowerCase();
    return matchesModule && text.includes(query.toLowerCase());
  }), [state.records, selectedModule, view, query]);

  function mutate(updater: (current: AppState) => AppState) { setState((current) => updater(current)); }
  function alert(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 6000); }

  async function loadCloud(userId: string) {
    if (!sb) return;
    const [tasks, attachments, trackers, notes] = await Promise.all([
      sb.from('planner_tasks').select('*').eq('user_id', userId).limit(5000),
      sb.from('planner_attachments').select('*').eq('user_id', userId).limit(5000),
      sb.from('xp_trackers').select('*').eq('user_id', userId).limit(5000),
      sb.from('xp_notes').select('*').eq('user_id', userId).limit(5000)
    ]);
    if (tasks.error) { alert(tasks.error.message); return; }
    const cloudTasks: PlannerTask[] = (tasks.data || []).map((row) => ({
      id: String(row.id), parentId: row.parent_id || null, title: row.title, notes: row.notes || '', level: row.level as PlannerLevel,
      startDate: row.start_date || row.due, dueDate: row.due, startTime: row.start_time || '', endTime: row.end_time || '', priority: row.priority || 'medium', status: row.status || (row.done ? 'done' : 'planned'), area: row.tags?.[0] || 'Life', estimateMinutes: row.estimate_minutes || 60, tags: row.tags || [], links: [], createdAt: row.created_at || now(), updatedAt: row.updated_at || now()
    }));
    const cloudFiles: PlannerFile[] = (attachments.data || []).map((row) => ({ id: String(row.id), taskId: row.task_id, title: row.name, name: row.name, type: row.mime_type, size: row.file_size, storagePath: row.storage_path, notes: '', createdAt: row.created_at || now() }));
    const trackerRecords: ModuleRecord[] = (trackers.data || []).map((row) => ({ id: String(row.id), module: row.module as ModuleName, title: row.title, body: row.notes || '', date: row.target_date || todayKey(), category: row.module, status: row.status || 'active', tags: [], data: row.data || {}, createdAt: row.created_at || now(), updatedAt: row.updated_at || now() }));
    const noteRecords: ModuleRecord[] = (notes.data || []).map((row) => ({ id: String(row.id), module: 'knowledge', title: row.title, body: row.body || '', date: (row.created_at || now()).slice(0, 10), category: row.kind || 'note', status: 'active', tags: row.tags || [], data: row.metadata || {}, createdAt: row.created_at || now(), updatedAt: row.updated_at || now() }));
    mutate((current) => ({ ...current, tasks: cloudTasks.length ? cloudTasks : current.tasks, files: cloudFiles.length ? cloudFiles : current.files, records: unique([...trackerRecords, ...noteRecords, ...current.records].map((r) => r.id)).map((id) => [...trackerRecords, ...noteRecords, ...current.records].find((r) => r.id === id)!) }));
    alert('Loaded your Supabase workspace.');
  }

  async function saveTaskToCloud(task: PlannerTask) {
    if (!sb || !user) return;
    const payload = { id: task.id, user_id: user.id, parent_id: task.parentId, title: task.title, notes: task.notes, level: task.level, start_date: task.startDate, due: task.dueDate, start_time: task.startTime || null, end_time: task.endTime || null, priority: task.priority, status: task.status, done: task.status === 'done', recurrence: 'none', estimate_minutes: task.estimateMinutes, tags: [task.area, ...task.tags].filter(Boolean), sort_order: 0 };
    const { error } = await sb.from('planner_tasks').upsert(payload);
    if (error) alert(error.message);
  }

  function openTask(level: PlannerLevel = 'daily', parentId: string | null = null) {
    const base = blankTask(level, parentId);
    setTaskForm(base); setEditingTask(null); setTaskModal(true);
  }
  function editTask(task: PlannerTask) { setTaskForm(task); setEditingTask(task); setTaskModal(true); }
  async function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = { ...taskForm, title: taskForm.title.trim(), updatedAt: now() };
    if (!clean.title) return;
    mutate((current) => ({ ...current, tasks: editingTask ? current.tasks.map((task) => task.id === clean.id ? clean : task) : [clean, ...current.tasks] }));
    setTaskModal(false); setSelectedTaskId(clean.id);
    await saveTaskToCloud(clean);
  }
  async function toggleTask(task: PlannerTask, status: Status = task.status === 'done' ? 'active' : 'done') {
    const next = { ...task, status, updatedAt: now() };
    mutate((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? next : item) }));
    await saveTaskToCloud(next);
  }
  function deleteTask(taskId: string) {
    const collect = new Set<string>([taskId]);
    let added = true;
    while (added) { added = false; for (const task of state.tasks) if (task.parentId && collect.has(task.parentId) && !collect.has(task.id)) { collect.add(task.id); added = true; } }
    mutate((current) => ({ ...current, tasks: current.tasks.filter((task) => !collect.has(task.id)), files: current.files.filter((file) => !file.taskId || !collect.has(file.taskId)) }));
    setSelectedTaskId(null); alert('Task and child tasks removed locally.');
  }

  async function breakdownTask(task: PlannerTask, engine: 'template' | 'local-ai') {
    setBusy(true); setAiProgress('');
    try {
      const childLevel: PlannerLevel = task.level === 'life' ? 'decade' : task.level === 'decade' ? 'yearly' : task.level === 'yearly' ? 'quarterly' : task.level === 'quarterly' ? 'monthly' : task.level === 'monthly' ? 'weekly' : task.level === 'weekly' ? 'daily' : 'subtask';
      const children = engine === 'local-ai' ? await qwenOrLlamaBreakdown(task, childLevel, setAiProgress) : instantBreakdown(task, childLevel);
      mutate((current) => ({ ...current, tasks: [...children, ...current.tasks] }));
      if (user) await Promise.all(children.map((child) => saveTaskToCloud(child)));
      alert(`${children.length} ${childLevel} steps added.`);
    } catch (error) { alert(error instanceof Error ? error.message : 'AI breakdown failed.'); }
    finally { setBusy(false); }
  }

  function openRecord(module: ModuleName) { setRecordForm(blankRecord(module)); setRecordModal(module); }
  function submitRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const record = { ...recordForm, title: recordForm.title.trim(), updatedAt: now() };
    if (!record.title) return;
    mutate((current) => ({ ...current, records: [record, ...current.records] }));
    setRecordModal(null); alert(`${moduleTitle(record.module)} entry added.`);
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!sb) return alert('Missing Supabase environment variables.');
    setBusy(true);
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) alert(error.message); else alert('Check your email for the sign-in link.');
  }
  async function signOut() { if (sb) await sb.auth.signOut(); setUser(null); }

  async function attachFiles(files: FileList | null) {
    if (!files?.length) return;
    const taskId = selectedTask?.id || null;
    const local: PlannerFile[] = [];
    for (const file of Array.from(files)) {
      const item: PlannerFile = { id: uid(), taskId, title: file.name, name: file.name, type: file.type || 'application/octet-stream', size: file.size, notes: '', createdAt: now() };
      local.push(item);
      if (sb && user) {
        const path = `${user.id}/${taskId || 'inbox'}/${item.id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const upload = await sb.storage.from('planner-vault').upload(path, file, { upsert: false, contentType: item.type });
        if (!upload.error) {
          item.storagePath = path;
          await sb.from('xp_vault_items').insert({ id: item.id, user_id: user.id, title: item.title, category: item.type, storage_path: path, notes: item.notes });
        } else alert(upload.error.message);
      }
    }
    mutate((current) => ({ ...current, files: [...local, ...current.files] }));
    alert(`${local.length} file attachment${local.length === 1 ? '' : 's'} added.`);
  }
  async function openFile(file: PlannerFile) {
    if (file.storagePath && sb) {
      const { data, error } = await sb.storage.from('planner-vault').createSignedUrl(file.storagePath, 120);
      if (error) return alert(error.message);
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } else alert('This file is indexed locally. Reattach while signed in to store it in Supabase.');
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `xavier-planner-os-backup-${todayKey()}.json`; link.click(); URL.revokeObjectURL(link.href);
  }
  async function importBackup(file?: File) {
    if (!file) return;
    const parsed = JSON.parse(await file.text()) as AppState;
    if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.records)) return alert('Invalid backup file.');
    setState(parsed); alert('Backup imported.');
  }

  function installTemplate(name: string) {
    const root = blankTask('yearly'); root.title = name; root.notes = `Template installed: ${name}. Break this down with Qwen/Llama or instant templates.`; root.priority = 'high';
    const steps = instantBreakdown(root, 'monthly');
    mutate((current) => ({ ...current, tasks: [root, ...steps, ...current.tasks] }));
    alert(`${name} template installed into planner.`);
  }

  function assistantContext(): AssistantContext {
    const done = state.tasks.filter((task) => task.status === 'done').length;
    const topTasks = [...state.tasks]
      .filter((task) => task.status !== 'done')
      .sort((a, b) => {
        const rank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return rank[a.priority] - rank[b.priority] || a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 8)
      .map((task) => ({ title: task.title, level: task.level, status: task.status, priority: task.priority, due: task.dueDate, area: task.area }));
    return {
      currentView: view,
      theme: state.theme,
      stats: { tasks: state.tasks.length, done, overdue, records: state.records.length, files: state.files.length },
      topTasks,
      recentRecords: state.records.slice(0, 8).map((record) => ({ module: record.module, title: record.title })),
      memory
    };
  }

  function assistantCreateTask(input: { title: string; notes?: string; level?: PlannerLevel; priority?: Priority; area?: string; dueDate?: string }) {
    const task = blankTask(input.level || 'daily');
    task.title = input.title;
    if (input.notes) task.notes = input.notes;
    if (input.priority) task.priority = input.priority;
    if (input.area) task.area = input.area;
    if (input.dueDate) { task.dueDate = input.dueDate; task.startDate = input.dueDate; }
    mutate((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    if (user) void saveTaskToCloud(task);
    alert(`Qwen created task "${task.title}".`);
  }

  function assistantCreateRecord(module: ModuleName, title: string, body?: string) {
    const record = { ...blankRecord(module), title, body: body || '' };
    mutate((current) => ({ ...current, records: [record, ...current.records] }));
    alert(`Qwen added a ${moduleTitle(module)} entry.`);
  }

  function assistantOpenTask(query: string): { found: boolean; title?: string } {
    const q = query.toLowerCase();
    const match = state.tasks.find((task) => task.title.toLowerCase().includes(q)) || state.tasks.find((task) => [task.notes, task.area, ...task.tags].join(' ').toLowerCase().includes(q));
    if (!match) return { found: false };
    setView('planner');
    setSelectedTaskId(match.id);
    return { found: true, title: match.title };
  }

  function assistantRemember(note: string) {
    const clean = note.trim();
    if (!clean) return;
    setMemory((current) => (current.some((item) => item.toLowerCase() === clean.toLowerCase()) ? current : [clean, ...current].slice(0, 60)));
  }

  const shellClass = `xp-shell theme-${state.theme} density-${state.density}`;
  return <div className={shellClass}>
    {mobileOpen && <button className="overlay" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="brand"><div className="mark">X</div><div><strong>Xavier Planner <span>OS</span></strong><small>Ultimate Life Operating System</small></div></div>
      <button className="quick" onClick={() => openTask('daily')}>+ Quick task</button>
      <nav>{views.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { setView(item.id); setMobileOpen(false); }}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sync-card"><strong>{user ? 'Cloud synced' : 'Device mode'}</strong><small>{user?.email || 'Sign in for Supabase sync + vault files'}</small><button onClick={() => setShowAuth(true)}>{user ? 'Account' : 'Sign in'}</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="menu" onClick={() => setMobileOpen(true)}>☰</button><div><span className="eyebrow">WORLD-CLASS PLANNER</span><h1>{views.find((item) => item.id === view)?.label || 'Command'}</h1></div><div className="search"><span>⌕</span><input placeholder="Search tasks, files, notes, finance, health…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><button className="primary" onClick={() => openTask('daily')}>Create</button></header>
      {notice && <div className="notice">{notice}</div>}
      {view === 'dashboard' && <Dashboard tasks={state.tasks} files={state.files} records={state.records} overdue={overdue} onOpenTask={setSelectedTaskId} onInstallTemplate={installTemplate} />}
      {view === 'planner' && <PlannerView tasks={filteredTasks} selectedTask={selectedTask} onSelect={setSelectedTaskId} onNew={openTask} onEdit={editTask} onToggle={toggleTask} onDelete={deleteTask} />}
      {view === 'calendar' && <CollaborativeCalendar user={user} tasks={filteredTasks} onSelectTask={setSelectedTaskId} onCreateTask={() => openTask('daily')} />}
      {view === 'board' && <BoardView tasks={filteredTasks} onSelect={setSelectedTaskId} onMove={toggleTask} />}
      {view === 'focus' && <FocusView tasks={filteredTasks} onSelect={setSelectedTaskId} onDone={(task) => void toggleTask(task, 'done')} />}
      {view === 'files' && <FilesView files={activeFiles} tasks={state.tasks} onAttach={() => fileInput.current?.click()} onOpen={(file) => void openFile(file)} />}
      {moduleMap[view] && <ModuleView module={moduleMap[view]!} records={visibleRecords} onNew={openRecord} />}
      {view === 'analytics' && <AnalyticsView tasks={state.tasks} records={state.records} files={state.files} />}
      {view === 'templates' && <TemplatesView onInstall={installTemplate} />}
      {view === 'settings' && <SettingsView state={state} setState={setState} onExport={exportBackup} onImport={() => backupInput.current?.click()} />}
    </main>
    <input ref={fileInput} className="hidden" type="file" multiple onChange={(event) => void attachFiles(event.target.files)} />
    <input ref={backupInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importBackup(event.target.files?.[0])} />
    {selectedTask && <TaskDrawer task={selectedTask} parents={lineage(state.tasks, selectedTask)} children={childrenOf(state.tasks, selectedTask.id)} files={state.files.filter((file) => file.taskId === selectedTask.id)} busy={busy} aiProgress={aiProgress} onClose={() => setSelectedTaskId(null)} onEdit={editTask} onNewChild={openTask} onBreakdown={(engine) => void breakdownTask(selectedTask, engine)} onAttach={() => fileInput.current?.click()} onOpenFile={(file) => void openFile(file)} />}
    {taskModal && <TaskModal form={taskForm} tasks={state.tasks} editing={Boolean(editingTask)} setForm={setTaskForm} onSubmit={submitTask} onClose={() => setTaskModal(false)} />}
    {recordModal && <RecordModal module={recordModal} form={recordForm} setForm={setRecordForm} onSubmit={submitRecord} onClose={() => setRecordModal(null)} />}
    {showAuth && <AuthModal user={user} email={email} setEmail={setEmail} busy={busy} onSubmit={signIn} onSignOut={() => void signOut()} onClose={() => setShowAuth(false)} />}
    <AssistantPanel actions={{
      getContext: assistantContext,
      navigate: setView,
      createTask: assistantCreateTask,
      createRecord: assistantCreateRecord,
      openTask: assistantOpenTask,
      setTheme: (theme) => mutate((current) => ({ ...current, theme: theme as AppState['theme'] })),
      remember: assistantRemember
    }} />
  </div>;
}

function Dashboard({ tasks, files, records, overdue, onOpenTask, onInstallTemplate }: { tasks: PlannerTask[]; files: PlannerFile[]; records: ModuleRecord[]; overdue: number; onOpenTask: (id: string) => void; onInstallTemplate: (name: string) => void }) {
  const active = tasks.filter((task) => task.status === 'active');
  const urgent = tasks.filter((task) => task.priority === 'urgent' || task.priority === 'high').slice(0, 6);
  return <section className="page"><div className="hero"><div><p className="eyebrow">LIFE → YEAR → MONTH → WEEK → DAY</p><h2>Everything connected. Nothing lost.</h2><p>Goals, tasks, documents, notes, habits, money, health, learning, travel and people in one command centre.</p></div><div className="hero-actions"><button onClick={() => onInstallTemplate('10 Year Vision → Today')}>Install Life OS</button><button onClick={() => onInstallTemplate('Business Launch War Room')}>Install Business OS</button></div></div><div className="stats"><Stat label="Total tasks" value={tasks.length} note={`${percentDone(tasks)}% completed`} /><Stat label="Active focus" value={active.length} note="In progress now" /><Stat label="Overdue" value={overdue} note="Need reschedule" /><Stat label="Files" value={files.length} note="Vault indexed" /><Stat label="Records" value={records.length} note="Knowledge + life modules" /></div><div className="grid two"><Panel title="Priority cockpit"><div className="task-list">{urgent.map((task) => <button key={task.id} className="task-card" onClick={() => onOpenTask(task.id)}><b>{task.title}</b><span>{levelLabel(task.level)} · {dateLabel(task.dueDate)} · {task.area}</span><Pill tone={task.priority}>{task.priority}</Pill></button>)}</div></Panel><Panel title="Full platform modules"><div className="module-grid">{modules.slice(0, 12).map((item) => <div className="module-card" key={item.module}><span>{item.icon}</span><b>{item.title}</b><small>{item.description}</small></div>)}</div></Panel></div></section>;
}
function Stat({ label, value, note }: { label: string; value: number | string; note: string }) { return <div className="stat"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <div className="panel"><div className="panel-head"><h3>{title}</h3></div>{children}</div>; }

function PlannerView({ tasks, selectedTask, onSelect, onNew, onEdit, onToggle, onDelete }: { tasks: PlannerTask[]; selectedTask: PlannerTask | null; onSelect: (id: string) => void; onNew: (level?: PlannerLevel, parentId?: string | null) => void; onEdit: (task: PlannerTask) => void; onToggle: (task: PlannerTask) => void; onDelete: (id: string) => void }) {
  return <section className="page"><div className="toolbar"><div>{plannerLevels.map((level) => <button key={level} onClick={() => onNew(level, selectedTask?.id || null)}>{levelLabel(level)}</button>)}</div></div><div className="level-columns">{plannerLevels.map((level) => <div className="level-col" key={level}><h3>{levelLabel(level)}</h3>{tasks.filter((task) => task.level === level).map((task) => <TaskRow key={task.id} task={task} onSelect={onSelect} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />)}</div>)}</div></section>;
}
function TaskRow({ task, onSelect, onEdit, onToggle, onDelete }: { task: PlannerTask; onSelect: (id: string) => void; onEdit: (task: PlannerTask) => void; onToggle: (task: PlannerTask) => void; onDelete: (id: string) => void }) {
  return <article className={`task-row ${task.status}`}><button className="check" onClick={() => void onToggle(task)}>{task.status === 'done' ? '✓' : ''}</button><button className="task-main" onClick={() => onSelect(task.id)}><b>{task.title}</b><span>{dateLabel(task.dueDate)} · {task.area} · {task.estimateMinutes}m</span></button><Pill tone={task.priority}>{task.priority}</Pill><button onClick={() => onEdit(task)}>Edit</button><button onClick={() => onDelete(task.id)}>Delete</button></article>;
}

function CalendarView({ tasks, onSelect }: { tasks: PlannerTask[]; onSelect: (id: string) => void }) {
  const days = Array.from({ length: 31 }, (_, index) => { const d = new Date(); d.setDate(index + 1); return d.toISOString().slice(0, 10); });
  return <section className="page"><div className="calendar-grid">{days.map((day) => <div className="day" key={day}><b>{new Date(`${day}T12:00:00`).getDate()}</b>{tasks.filter((task) => task.dueDate === day || task.startDate === day).slice(0, 4).map((task) => <button key={task.id} onClick={() => onSelect(task.id)}>{task.title}</button>)}</div>)}</div></section>;
}
function BoardView({ tasks, onSelect, onMove }: { tasks: PlannerTask[]; onSelect: (id: string) => void; onMove: (task: PlannerTask, status: Status) => void }) {
  const statuses: Status[] = ['planned','active','blocked','done'];
  return <section className="page"><div className="board-grid">{statuses.map((status) => <div className="board-col" key={status}><h3>{status}</h3>{tasks.filter((task) => task.status === status).map((task) => <article key={task.id} className="board-card"><button onClick={() => onSelect(task.id)}><b>{task.title}</b><span>{levelLabel(task.level)} · {dateLabel(task.dueDate)}</span></button><div>{statuses.filter((s) => s !== status).map((s) => <button key={s} onClick={() => void onMove(task, s)}>{s}</button>)}</div></article>)}</div>)}</div></section>;
}
function FocusView({ tasks, onSelect, onDone }: { tasks: PlannerTask[]; onSelect: (id: string) => void; onDone: (task: PlannerTask) => void }) {
  const next = tasks.filter((task) => task.status !== 'done').sort((a, b) => (a.priority === 'urgent' ? -1 : 0) - (b.priority === 'urgent' ? -1 : 0) || a.dueDate.localeCompare(b.dueDate))[0];
  return <section className="page focus-page">{next ? <div className="focus-card"><span className="eyebrow">ONE THING NOW</span><h2>{next.title}</h2><p>{next.notes || 'No notes yet. Add the files, context and next action in the drawer.'}</p><div><Pill>{levelLabel(next.level)}</Pill><Pill tone={next.priority}>{next.priority}</Pill><Pill>{dateLabel(next.dueDate)}</Pill></div><button className="primary" onClick={() => onSelect(next.id)}>Open workspace</button><button onClick={() => onDone(next)}>Mark done</button></div> : <div className="empty"><h2>All clear.</h2><p>No open focus tasks.</p></div>}</section>;
}
function FilesView({ files, tasks, onAttach, onOpen }: { files: PlannerFile[]; tasks: PlannerTask[]; onAttach: () => void; onOpen: (file: PlannerFile) => void }) {
  return <section className="page"><div className="toolbar"><button className="primary" onClick={onAttach}>Attach files/photos/digital assets</button></div><div className="file-grid">{files.map((file) => <button className="file-card" key={file.id} onClick={() => onOpen(file)}><span>▣</span><b>{file.name}</b><small>{file.type || 'file'} · {Math.round(file.size/1024)} KB</small><small>{tasks.find((task) => task.id === file.taskId)?.title || 'Inbox vault'}</small></button>)}</div></section>;
}
function ModuleView({ module, records, onNew }: { module: ModuleName; records: ModuleRecord[]; onNew: (module: ModuleName) => void }) {
  const info = modules.find((item) => item.module === module)!;
  return <section className="page"><div className="hero small"><div><p className="eyebrow">{info.icon} {info.title}</p><h2>{info.description}</h2></div><button className="primary" onClick={() => onNew(module)}>Add entry</button></div><div className="record-grid">{records.filter((record) => record.module === module).map((record) => <article className="record" key={record.id}><div><Pill>{record.category}</Pill><Pill>{record.status}</Pill></div><h3>{record.title}</h3><p>{record.body}</p><small>{dateLabel(record.date)} · {record.tags.join(', ')}</small>{typeof record.amount === 'number' && <strong>${record.amount.toFixed(2)}</strong>}</article>)}</div></section>;
}
function AnalyticsView({ tasks, records, files }: { tasks: PlannerTask[]; records: ModuleRecord[]; files: PlannerFile[] }) {
  const byLevel = plannerLevels.map((level) => ({ level, count: tasks.filter((task) => task.level === level).length }));
  const byModule = modules.map((module) => ({ name: module.title, count: records.filter((record) => record.module === module.module).length })).filter((item) => item.count);
  return <section className="page"><div className="stats"><Stat label="Completion" value={`${percentDone(tasks)}%`} note="Overall task progress" /><Stat label="Records" value={records.length} note="Across life modules" /><Stat label="Files" value={files.length} note="Vault items" /><Stat label="High priority" value={tasks.filter((task) => task.priority === 'urgent' || task.priority === 'high').length} note="Critical workload" /></div><div className="grid two"><Panel title="Task levels">{byLevel.map((item) => <div className="bar" key={item.level}><span>{levelLabel(item.level)}</span><i style={{ width: `${Math.min(100, item.count * 12)}%` }} /><b>{item.count}</b></div>)}</Panel><Panel title="Life modules">{byModule.map((item) => <div className="bar" key={item.name}><span>{item.name}</span><i style={{ width: `${Math.min(100, item.count * 20)}%` }} /><b>{item.count}</b></div>)}</Panel></div></section>;
}
function TemplatesView({ onInstall }: { onInstall: (name: string) => void }) { return <section className="page"><div className="template-grid">{templates.map((template) => <article className="template" key={template.name}><Pill>{template.category}</Pill><h3>{template.name}</h3><p>{template.details}</p><button onClick={() => onInstall(template.name)}>Install template</button></article>)}</div></section>; }
function SettingsView({ state, setState, onExport, onImport }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onExport: () => void; onImport: () => void }) {
  return <section className="page"><div className="settings-grid"><Panel title="Themes"><div className="choices">{['midnight','glass','aurora','executive','amoled','nature'].map((theme) => <button className={state.theme === theme ? 'chosen' : ''} key={theme} onClick={() => setState((s) => ({ ...s, theme }))}>{theme}</button>)}</div></Panel><Panel title="Density"><div className="choices"><button className={state.density === 'comfortable' ? 'chosen' : ''} onClick={() => setState((s) => ({ ...s, density: 'comfortable' }))}>Comfortable</button><button className={state.density === 'compact' ? 'chosen' : ''} onClick={() => setState((s) => ({ ...s, density: 'compact' }))}>Compact</button></div></Panel><Panel title="Backup"><button onClick={onExport}>Export JSON backup</button><button onClick={onImport}>Import backup</button></Panel></div></section>;
}

function TaskDrawer({ task, parents, children, files, busy, aiProgress, onClose, onEdit, onNewChild, onBreakdown, onAttach, onOpenFile }: { task: PlannerTask; parents: PlannerTask[]; children: PlannerTask[]; files: PlannerFile[]; busy: boolean; aiProgress: string; onClose: () => void; onEdit: (task: PlannerTask) => void; onNewChild: (level?: PlannerLevel, parentId?: string | null) => void; onBreakdown: (engine: 'template' | 'local-ai') => void; onAttach: () => void; onOpenFile: (file: PlannerFile) => void }) {
  return <aside className="drawer"><button className="x" onClick={onClose}>×</button><p className="eyebrow">TASK WORKSPACE</p><h2>{task.title}</h2><p>{task.notes}</p><div className="drawer-actions"><button onClick={() => onEdit(task)}>Edit</button><button onClick={onAttach}>Attach</button></div><div className="chips"><Pill>{levelLabel(task.level)}</Pill><Pill tone={task.priority}>{task.priority}</Pill><Pill>{task.status}</Pill><Pill>{dateLabel(task.dueDate)}</Pill></div><section><h3>Hierarchy</h3>{parents.map((item) => <div className="mini" key={item.id}>↑ {item.title}</div>)}{children.map((item) => <div className="mini" key={item.id}>↓ {item.title}</div>)}<div className="child-buttons">{plannerLevels.map((level) => <button key={level} onClick={() => onNewChild(level, task.id)}>+ {level}</button>)}</div></section><section><h3>AI breakdown</h3><button disabled={busy} onClick={() => onBreakdown('template')}>Instant smart templates</button><button disabled={busy} onClick={() => onBreakdown('local-ai')}>Run local Qwen/Llama</button>{aiProgress && <small>{aiProgress}</small>}</section><section><h3>Files</h3>{files.map((file) => <button className="mini" key={file.id} onClick={() => onOpenFile(file)}>▣ {file.name}</button>)}<button onClick={onAttach}>Attach more</button></section></aside>;
}
function TaskModal({ form, tasks, editing, setForm, onSubmit, onClose }: { form: PlannerTask; tasks: PlannerTask[]; editing: boolean; setForm: React.Dispatch<React.SetStateAction<PlannerTask>>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  return <div className="modal"><form className="modal-card" onSubmit={onSubmit}><button type="button" className="x" onClick={onClose}>×</button><h2>{editing ? 'Edit task' : 'Create task'}</h2><Field label="Title"><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></Field><Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={4} /></Field><div className="form-grid"><Field label="Level"><select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as PlannerLevel }))}>{plannerLevels.map((level) => <option key={level}>{level}</option>)}</select></Field><Field label="Parent"><select value={form.parentId || ''} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value || null }))}><option value="">No parent</option>{tasks.filter((task) => task.id !== form.id).map((task) => <option value={task.id} key={task.id}>{task.level}: {task.title}</option>)}</select></Field><Field label="Start"><input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></Field><Field label="Due"><input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} /></Field><Field label="Start time"><input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} /></Field><Field label="End time"><input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} /></Field><Field label="Priority"><select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}>{['low','medium','high','urgent'].map((p) => <option key={p}>{p}</option>)}</select></Field><Field label="Status"><select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Status }))}>{['planned','active','blocked','done'].map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Area"><input value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} /></Field><Field label="Estimate minutes"><input type="number" value={form.estimateMinutes} onChange={(e) => setForm((f) => ({ ...f, estimateMinutes: Number(e.target.value) }))} /></Field></div><Field label="Tags"><input value={form.tags.join(', ')} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }))} /></Field><button className="primary" type="submit">Save task</button></form></div>;
}
function RecordModal({ module, form, setForm, onSubmit, onClose }: { module: ModuleName; form: ModuleRecord; setForm: React.Dispatch<React.SetStateAction<ModuleRecord>>; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  const info = modules.find((item) => item.module === module)!;
  return <div className="modal"><form className="modal-card" onSubmit={onSubmit}><button type="button" className="x" onClick={onClose}>×</button><h2>Add {info.title}</h2><Field label="Title"><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></Field><Field label="Details"><textarea rows={5} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} /></Field><div className="form-grid"><Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></Field><Field label="Category"><input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></Field><Field label="Status"><input value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} /></Field><Field label="Amount"><input type="number" value={form.amount || ''} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value ? Number(e.target.value) : undefined }))} /></Field></div><Field label="Tags"><input value={form.tags.join(', ')} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }))} /></Field><button className="primary" type="submit">Save entry</button></form></div>;
}
function AuthModal({ user, email, setEmail, busy, onSubmit, onSignOut, onClose }: { user: User | null; email: string; setEmail: (value: string) => void; busy: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onSignOut: () => void; onClose: () => void }) {
  return <div className="modal"><div className="modal-card"><button type="button" className="x" onClick={onClose}>×</button><h2>Supabase account</h2>{user ? <><p>Signed in as {user.email}. Your core planner and private vault can sync to Supabase.</p><button onClick={onSignOut}>Sign out</button></> : <form onSubmit={onSubmit}><p>Email magic link login. No password needed.</p><Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field><button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in link'}</button></form>}</div></div>;
}
