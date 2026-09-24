export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export function advanceDate(date: string, rule: RepeatRule): string | null {
  if (rule === 'none') return null;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  const value = new Date(year, month - 1, day, 12);
  if (rule === 'daily') value.setDate(value.getDate() + 1);
  if (rule === 'weekly') value.setDate(value.getDate() + 7);
  if (rule === 'monthly' || rule === 'yearly') {
    const targetMonth = rule === 'monthly' ? month : month - 1;
    const targetYear = rule === 'yearly' ? year + 1 : year;
    const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
    value.setFullYear(targetYear, targetMonth, Math.min(day, lastDay));
  }
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function nextOccurrence(date: string, rule: RepeatRule, after: string): string | null {
  if (rule === 'daily' || rule === 'weekly') {
    const parse = (value: string) => { const [y, m, d] = value.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    const interval = rule === 'daily' ? 1 : 7;
    const days = Math.ceil((parse(after) - parse(date)) / 86400000);
    const steps = Math.max(1, Math.ceil(days / interval));
    const result = new Date(parse(date) + steps * interval * 86400000);
    return result.toISOString().slice(0, 10);
  }
  let next = advanceDate(date, rule);
  for (let i = 0; next && next < after && i < 1200; i++) next = advanceDate(next, rule);
  return next;
}
