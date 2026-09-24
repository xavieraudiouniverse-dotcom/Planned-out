export const maxDuration = 30;

const FREE_MODELS = {
  'gpt-oss-120b': {
    id: '@cf/openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
  },
  'nemotron-3-120b': {
    id: '@cf/nvidia/nemotron-3-120b-a12b',
    label: 'Nemotron 3 Super 120B',
  },
  'gemma-4-26b': {
    id: '@cf/google/gemma-4-26b-a4b-it',
    label: 'Gemma 4 26B',
  },
  'qwen-3.8-27b': {
    id: '@cf/qwen/qwen3.8-27b',
    label: 'Qwen 3.8 27B',
  },
} as const;

type CloudflareModelKey = keyof typeof FREE_MODELS;
type ModelChoice = 'auto' | CloudflareModelKey;

type AssistantContext = {
  currentView?: string;
  theme?: string;
  stats?: {
    tasks: number;
    done: number;
    overdue: number;
    records: number;
    files: number;
  };
  topTasks?: Array<{
    title: string;
    level: string;
    status: string;
    priority: string;
    due: string;
    area: string;
  }>;
  recentRecords?: Array<{ module: string; title: string }>;
  memory?: string[];
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// Planner/agent-first ordering. Every entry is a Cloudflare Workers AI model.
const AUTO_ORDER: CloudflareModelKey[] = [
  'nemotron-3-120b',
  'gpt-oss-120b',
  'gemma-4-26b',
  'qwen-3.8-27b',
];

function buildSystemPrompt(ctx: AssistantContext): string {
  const stats = ctx.stats
    ? `Tasks: ${ctx.stats.tasks} (${ctx.stats.done} done, ${ctx.stats.overdue} overdue). Records: ${ctx.stats.records}. Files: ${ctx.stats.files}.`
    : 'No planner statistics are available yet.';

  const tasks = ctx.topTasks?.length
    ? ctx.topTasks
        .map(
          (task) =>
            `- [${task.status}/${task.priority}] ${task.title} (${task.level}, ${task.area}, due ${task.due})`,
        )
        .join('\n')
    : 'No priority tasks are available.';

  const records = ctx.recentRecords?.length
    ? ctx.recentRecords
        .map((record) => `- ${record.module}: ${record.title}`)
        .join('\n')
    : 'No recent records are available.';

  const memory = ctx.memory?.length
    ? ctx.memory.map((item) => `- ${item}`).join('\n')
    : 'No stored preferences are available.';

  return [
    'You are Xavier AI, the built-in intelligence for Xavier Planner OS Ultimate.',
    'The planner hierarchy is life > decade > yearly > quarterly > monthly > weekly > daily > hourly > task > subtask.',
    'Help the user plan, organise, prioritise, reason about goals, and make practical decisions.',
    'Be concise, specific, practical, and action-oriented.',
    'Never claim you created, changed, deleted, saved, navigated, or completed something in the app unless the app actually performed that action.',
    '',
    'CURRENT PLANNER CONTEXT',
    `Current view: ${ctx.currentView || 'dashboard'}. Theme: ${ctx.theme || 'midnight'}.`,
    stats,
    '',
    'Priority tasks:',
    tasks,
    '',
    'Recent records:',
    records,
    '',
    'Remembered preferences:',
    memory,
  ].join('\n');
}

function normalizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (item): item is { role: unknown; content: unknown } =>
        Boolean(item && typeof item === 'object'),
    )
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .slice(-10)
    .map((item) => ({
      role: item.role as 'user' | 'assistant',
      content: String(item.content || '').slice(0, 8000),
    }));
}

function normalizeModel(value: unknown): ModelChoice {
  if (value === 'auto') return 'auto';

  if (typeof value === 'string' && value in FREE_MODELS) {
    return value as CloudflareModelKey;
  }

  return 'auto';
}

function extractText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof payload?.result?.response === 'string') {
    return payload.result.response.trim();
  }

  return '';
}

async function runCloudflare(
  key: CloudflareModelKey,
  system: string,
  history: ChatMessage[],
  prompt: string,
): Promise<{ text: string; model: string }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !token) {
    throw new Error(
      'Cloudflare Workers AI is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Vercel.',
    );
  }

  const selected = FREE_MODELS[key];

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selected.id,
        messages: [
          { role: 'system', content: system },
          ...history,
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        options: { rejectIfBusy: true },
      }),
      cache: 'no-store',
    },
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.error?.message ||
      payload?.message ||
      `Cloudflare returned HTTP ${response.status}.`;

    throw new Error(String(message));
  }

  const text = extractText(payload);

  if (!text) {
    throw new Error(`${selected.label} returned an empty response.`);
  }

  return { text, model: selected.label };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      prompt?: unknown;
      context?: AssistantContext;
      history?: unknown;
      model?: unknown;
    };

    const prompt =
      typeof body.prompt === 'string' ? body.prompt.trim() : '';

    if (!prompt) {
      return Response.json({ error: 'A message is required.' }, { status: 400 });
    }

    const requestedModel = normalizeModel(body.model);
    const history = normalizeHistory(body.history);
    const system = buildSystemPrompt(body.context || {});

    const order: CloudflareModelKey[] =
      requestedModel === 'auto'
        ? AUTO_ORDER
        : [
            requestedModel,
            ...AUTO_ORDER.filter((key) => key !== requestedModel),
          ];

    const failures: string[] = [];

    for (const key of order) {
      try {
        const result = await runCloudflare(key, system, history, prompt);

        return Response.json({
          text: result.text,
          model: result.model,
          provider: 'Cloudflare Workers AI',
          requestedModel,
        });
      } catch (error) {
        failures.push(
          `${FREE_MODELS[key].label}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return Response.json(
      {
        error:
          'All free AI models are currently unavailable. ' +
          failures.join(' | '),
      },
      { status: 503 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'The AI request failed.',
      },
      { status: 500 },
    );
  }
}
