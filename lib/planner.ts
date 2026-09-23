import { z } from 'zod';

export const levels = ['yearly', 'monthly', 'weekly', 'daily'] as const;
export type Level = typeof levels[number];
export const taskSchema = z.object({
  id: z.string().uuid(), parent_id: z.string().uuid().nullable(),
  title: z.string().min(1).max(300), notes: z.string().max(5000),
  level: z.enum(levels), due: z.string(), done: z.boolean()
});
export type Task = z.infer<typeof taskSchema>;
export const planSchema = z.object({ tasks: z.array(taskSchema).max(1000) });
export function validateTree(tasks: Task[]) {
  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length) throw new Error('Duplicate tasks');
  for (const task of tasks) if (task.parent_id && !ids.has(task.parent_id)) throw new Error('Invalid parent');
  return tasks;
}
export function descendants(id: string, tasks: Task[]) {
  const result = new Set([id]);
  let changed = true;
  while (changed) { changed = false; for (const task of tasks) if (task.parent_id && result.has(task.parent_id) && !result.has(task.id)) { result.add(task.id); changed = true; } }
  return result;
}
