import type { PlannerTask, PlannerLevel } from '@/lib/types';

const MODELS = [
  'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
  'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
  'Llama-3.2-1B-Instruct-q4f32_1-MLC'
] as const;

export function instantBreakdown(parent: PlannerTask, childLevel: PlannerLevel): PlannerTask[] {
  const count = childLevel === 'monthly' ? 6 : childLevel === 'weekly' ? 5 : childLevel === 'daily' ? 6 : 4;
  const verbs = ['Clarify', 'Prepare', 'Execute', 'Review', 'Improve', 'Document', 'Share', 'Lock in'];
  return Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    parentId: parent.id,
    title: `${verbs[index % verbs.length]}: ${parent.title}`,
    notes: `Generated smart step for ${parent.title}. Adjust the date, files, people, budget and checklist as needed.`,
    level: childLevel,
    startDate: parent.startDate,
    dueDate: parent.dueDate,
    startTime: '',
    endTime: '',
    priority: index < 2 ? 'high' : 'medium',
    status: 'planned',
    area: parent.area,
    estimateMinutes: childLevel === 'daily' ? 45 : 180,
    tags: [...new Set([...parent.tags, 'ai-template'])],
    links: [parent.id],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

export async function qwenOrLlamaBreakdown(
  parent: PlannerTask,
  childLevel: PlannerLevel,
  onProgress: (message: string) => void
): Promise<PlannerTask[]> {
  if (!('gpu' in navigator)) throw new Error('This device/browser does not expose WebGPU. Use instant templates or try Chrome/Edge on a supported phone or computer.');
  const webllm = await import('@mlc-ai/web-llm');
  const available = new Set(webllm.prebuiltAppConfig.model_list.map((model) => model.model_id));
  const modelId = MODELS.find((id) => available.has(id));
  if (!modelId) throw new Error('No compatible Qwen/Llama WebLLM model is available in this package version.');
  const worker = new Worker(new URL('./local-ai.worker.ts', import.meta.url), { type: 'module' });
  try {
    const engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: (p) => onProgress(p.text) });
    onProgress(`Running ${modelId} locally on this device…`);
    const completion = await engine.chat.completions.create({
      temperature: 0.25,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return JSON only: {"steps":[{"title":"specific action","notes":"practical note","estimateMinutes":number,"priority":"low|medium|high|urgent"}]}. Do not claim the work is done.' },
        { role: 'user', content: JSON.stringify({ goal: parent.title, notes: parent.notes, childLevel, dates: { start: parent.startDate, due: parent.dueDate } }) }
      ]
    });
    const raw = completion.choices[0]?.message.content || '{}';
    const parsed = JSON.parse(raw) as { steps?: Array<{ title?: string; notes?: string; estimateMinutes?: number; priority?: PlannerTask['priority'] }> };
    const steps = parsed.steps?.slice(0, 12) || [];
    if (!steps.length) return instantBreakdown(parent, childLevel);
    return steps.map((step) => ({
      id: crypto.randomUUID(), parentId: parent.id, title: String(step.title || `Step for ${parent.title}`).slice(0, 260), notes: String(step.notes || '').slice(0, 3000), level: childLevel,
      startDate: parent.startDate, dueDate: parent.dueDate, startTime: '', endTime: '', priority: step.priority || 'medium', status: 'planned', area: parent.area,
      estimateMinutes: Number(step.estimateMinutes || 60), tags: [...new Set([...parent.tags, 'qwen'])], links: [parent.id], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }));
  } finally {
    worker.terminate();
  }
}
