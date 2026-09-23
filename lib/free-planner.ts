import type { Level, Task } from './planner';
import { levels } from './planner';

const iso = (date: Date) => date.toISOString().slice(0, 10);
export function breakdown(parent: Task, now = new Date()): Task[] {
  const next = levels[levels.indexOf(parent.level) + 1] as Level | undefined;
  if (!next) return [];
  const end = new Date(`${parent.due}T12:00:00`);
  const count = next === 'daily' ? 7 : next === 'weekly' ? 4 : 3;
  return Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(), parent_id: parent.id,
    title: `${parent.title} — ${next} step ${index + 1}`, notes: '', level: next,
    due: iso(new Date(Math.min(end.getTime(), now.getTime() + (index + 1) * 86400000))), done: false
  }));
}
