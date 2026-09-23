'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Level, Task } from '@/lib/planner';
import { descendants, levels, planSchema } from '@/lib/planner';
import { breakdown } from '@/lib/free-planner';

const today = () => new Date().toISOString().slice(0, 10);
const emptyTask = (level: Level): Task => ({ id: crypto.randomUUID(), parent_id: null, title: '', notes: '', level, due: today(), done: false });

export function Planner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [level, setLevel] = useState<Level>('yearly');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    try { const raw = localStorage.getItem('planned-out-v1'); if (raw) setTasks(planSchema.parse(JSON.parse(raw)).tasks); }
    catch { setMessage('Saved plan could not be loaded, so a clean plan was started.'); }
  }, []);
  function save(next: Task[]) { setTasks(next); localStorage.setItem('planned-out-v1', JSON.stringify({ tasks: next })); }
  function add(event: React.FormEvent) { event.preventDefault(); if (!title.trim()) return; save([...tasks, { ...emptyTask(level), title: title.trim(), notes: notes.trim() }]); setTitle(''); setNotes(''); setMessage('Task saved on this device.'); }
  function toggle(task: Task) { save(tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item)); }
  function remove(task: Task) { const ids = descendants(task.id, tasks); save(tasks.filter((item) => !ids.has(item.id))); setMessage('Task and its child steps were removed.'); }
  function expand(task: Task) { const children = breakdown(task); save([...tasks, ...children]); setMessage(`${children.length} ${children[0]?.level ?? ''} steps added.`); }
  const visible = useMemo(() => tasks.filter((task) => task.level === level), [tasks, level]);

  return <div className="app"><header className="topbar"><a className="brand" href="/">PLANNED-OUT</a><span>Saved on this device</span></header><main><section className="heading"><div><p className="eyebrow">PLAN WITH PURPOSE</p><h1>Turn goals into action.</h1><p className="subtext">Start with a goal, then break it into steps you can actually finish.</p></div></section><div className="toolbar">{levels.map((item) => <button key={item} className={level === item ? 'active' : ''} onClick={() => setLevel(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div><section className="card"><h2>Add a {level} goal</h2><form onSubmit={add}><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you want to accomplish?" maxLength={300} /></label><label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Add useful context (optional)" maxLength={5000} /></label><button className="primary" type="submit">Add to plan</button></form></section><section className="card"><h2>{level[0].toUpperCase() + level.slice(1)} plan</h2>{visible.length === 0 ? <p className="empty">Nothing here yet. Add your first goal above.</p> : visible.map((task) => <article className="task" key={task.id}><input type="checkbox" checked={task.done} onChange={() => toggle(task)} aria-label={`Mark ${task.title} complete`} /><div className="task-content"><div className={`task-title ${task.done ? 'done' : ''}`}>{task.title}</div><div className="task-meta">Due {task.due}{task.notes ? ` · ${task.notes}` : ''}</div><div className="actions"><button onClick={() => expand(task)} disabled={task.level === 'daily'}>Break into steps</button><button onClick={() => remove(task)}>Remove</button></div></div></article>)}</section>{message && <p className="notice">{message}</p>}</main></div>;
}
