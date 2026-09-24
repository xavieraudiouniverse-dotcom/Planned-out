import type { PlannerTask, PlannerLevel } from '@/lib/types';

const MODELS = [
  // Prefer the smallest Qwen model first for phones/tablets.
  'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
  'Llama-3.2-1B-Instruct-q4f32_1-MLC'
] as const;

type WebLLM = typeof import('@mlc-ai/web-llm');
type LoadedEngine = Awaited<ReturnType<WebLLM['CreateWebWorkerMLCEngine']>>;

let webllmPromise: Promise<WebLLM> | null = null;
let enginePromise: Promise<LoadedEngine> | null = null;
let activeModelId = '';

function getWebLLM() {
  webllmPromise ??= import('@mlc-ai/web-llm');
  return webllmPromise;
}

async function getEngine(onProgress: (message: string) => void) {
  if (!('gpu' in navigator)) {
    throw new Error(
      'This browser does not expose WebGPU. Use instant templates or try the latest Chrome/Edge on a supported device.'
    );
  }

  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    const webllm = await getWebLLM();
    const available = new Set(
      webllm.prebuiltAppConfig.model_list.map((model) => model.model_id)
    );

    const modelId = MODELS.find((id) => available.has(id));
    if (!modelId) {
      throw new Error(
        'No compatible local Qwen/Llama WebLLM model is available.'
      );
    }

    activeModelId = modelId;

    const worker = new Worker(
      new URL('./local-ai.worker.ts', import.meta.url),
      { type: 'module' }
    );

    try {
      return await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: (progress) => onProgress(progress.text)
      });
    } catch (error) {
      worker.terminate();
      enginePromise = null;
      activeModelId = '';
      throw error;
    }
  })();

  return enginePromise;
}

export function instantBreakdown(
  parent: PlannerTask,
  childLevel: PlannerLevel
): PlannerTask[] {
  const count =
    childLevel === 'monthly'
      ? 6
      : childLevel === 'weekly'
        ? 5
        : childLevel === 'daily'
          ? 6
          : 4;

  const verbs = [
    'Clarify',
    'Prepare',
    'Execute',
    'Review',
    'Improve',
    'Document',
    'Share',
    'Lock in'
  ];

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
  const engine = await getEngine(onProgress);

  onProgress(
    `Running ${activeModelId || 'local Qwen'} on this device…`
  );

  const completion = await engine.chat.completions.create({
    temperature: 0.25,
    max_tokens: 900,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Return JSON only: {"steps":[{"title":"specific action","notes":"practical note","estimateMinutes":number,"priority":"low|medium|high|urgent"}]}. Do not claim the work is done.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          goal: parent.title,
          notes: parent.notes,
          childLevel,
          dates: { start: parent.startDate, due: parent.dueDate }
        })
      }
    ]
  });

  const raw = completion.choices[0]?.message.content || '{}';

  let parsed: {
    steps?: Array<{
      title?: string;
      notes?: string;
      estimateMinutes?: number;
      priority?: PlannerTask['priority'];
    }>;
  };

  try {
    parsed = JSON.parse(raw);
  } catch {
    return instantBreakdown(parent, childLevel);
  }

  const steps = parsed.steps?.slice(0, 12) || [];
  if (!steps.length) return instantBreakdown(parent, childLevel);

  return steps.map((step) => ({
    id: crypto.randomUUID(),
    parentId: parent.id,
    title: String(step.title || `Step for ${parent.title}`).slice(0, 260),
    notes: String(step.notes || '').slice(0, 3000),
    level: childLevel,
    startDate: parent.startDate,
    dueDate: parent.dueDate,
    startTime: '',
    endTime: '',
    priority: step.priority || 'medium',
    status: 'planned',
    area: parent.area,
    estimateMinutes: Number(step.estimateMinutes || 60),
    tags: [...new Set([...parent.tags, 'qwen'])],
    links: [parent.id],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

export async function localQwenChat(
  prompt: string,
  context: unknown,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  onProgress: (message: string) => void
): Promise<string> {
  const engine = await getEngine(onProgress);

  onProgress(
    `Running ${activeModelId || 'local Qwen'} locally…`
  );

  const completion = await engine.chat.completions.create({
    temperature: 0.35,
    max_tokens: 800,
    messages: [
      {
        role: 'system',
        content: `You are Qwen, the private on-device assistant inside Xavier Planner OS.

Help the user plan, organise, prioritise and reason about their tasks and goals.

Be concise, practical and action-oriented.

Never claim you created, changed, deleted, navigated, saved or completed something in the application unless that action actually happened.

CURRENT PLANNER CONTEXT:
${JSON.stringify(context, null, 2)}`
      },
      ...history.slice(-8),
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  return (
    completion.choices[0]?.message.content?.trim() ||
    'Qwen did not return a response.'
  );
}
