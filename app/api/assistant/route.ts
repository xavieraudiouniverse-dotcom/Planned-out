import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  stepCountIs,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

// Qwen 3 flagship instruct model, served through the Vercel AI Gateway.
const MODEL = 'alibaba/qwen3.5-flash';

type AssistantContext = {
  currentView?: string;
  theme?: string;
  stats?: { tasks: number; done: number; overdue: number; records: number; files: number };
  topTasks?: Array<{ title: string; level: string; status: string; priority: string; due: string; area: string }>;
  recentRecords?: Array<{ module: string; title: string }>;
  memory?: string[];
};

const VIEWS = [
  'dashboard', 'planner', 'calendar', 'board', 'focus', 'files', 'knowledge',
  'habits', 'journal', 'finance', 'health', 'learning', 'travel', 'contacts',
  'analytics', 'templates', 'settings',
] as const;

const MODULES = [
  'knowledge', 'habit', 'journal', 'finance', 'health', 'learning', 'travel', 'contact',
] as const;

const THEMES = ['midnight', 'glass', 'aurora', 'executive', 'amoled', 'nature'] as const;

function buildSystemPrompt(ctx: AssistantContext): string {
  const stats = ctx.stats
    ? `Tasks: ${ctx.stats.tasks} (${ctx.stats.done} done, ${ctx.stats.overdue} overdue). Records: ${ctx.stats.records}. Files: ${ctx.stats.files}.`
    : 'No stats available yet.';
  const tasks = ctx.topTasks?.length
    ? ctx.topTasks.map((t) => `- [${t.status}/${t.priority}] ${t.title} (${t.level}, ${t.area}, due ${t.due})`).join('\n')
    : 'No tasks yet.';
  const records = ctx.recentRecords?.length
    ? ctx.recentRecords.map((r) => `- ${r.module}: ${r.title}`).join('\n')
    : 'No records yet.';
  const memory = ctx.memory?.length
    ? ctx.memory.map((m) => `- ${m}`).join('\n')
    : 'Nothing learned yet. Pay attention and remember useful preferences.';

  return [
    'You are Qwen, the built-in assistant for "Xavier Planner OS Ultimate", a life operating system.',
    'The app organizes life into a hierarchy: life > decade > yearly > quarterly > monthly > weekly > daily > hourly > task > subtask.',
    'You help the user manage their planner, navigate the app, and you LEARN their ways over time.',
    '',
    'Be concise, warm, and practical. Take action with tools instead of only describing what to do.',
    'When the user asks to go somewhere, use navigate. When they describe something to plan, create the task or record for them.',
    'Whenever you notice a durable preference, habit, working style, priority, or personal fact, call rememberAboutUser so you can serve them better next time. Do not remember trivial or one-off details.',
    'After taking actions, briefly confirm what you did in plain language.',
    '',
    `Available views: ${VIEWS.join(', ')}.`,
    `Available record modules: ${MODULES.join(', ')}.`,
    `Available themes: ${THEMES.join(', ')}.`,
    '',
    '## Current context',
    `Current view: ${ctx.currentView || 'dashboard'}. Theme: ${ctx.theme || 'midnight'}.`,
    stats,
    '',
    '### Priority tasks',
    tasks,
    '',
    '### Recent records',
    records,
    '',
    '### What you have learned about this user',
    memory,
  ].join('\n');
}

export async function POST(req: Request) {
  const { messages, context }: { messages: UIMessage[]; context?: AssistantContext } = await req.json();

  const result = streamText({
    model: MODEL,
    system: buildSystemPrompt(context || {}),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(6),
    tools: {
      navigate: tool({
        description: 'Switch the app to a different view/screen.',
        inputSchema: z.object({
          view: z.enum(VIEWS).describe('The view to open.'),
        }),
      }),
      createTask: tool({
        description: 'Create a new planner task/goal at any level of the hierarchy.',
        inputSchema: z.object({
          title: z.string().describe('Short, actionable title.'),
          notes: z.string().optional().describe('Optional details or context.'),
          level: z
            .enum(['life', 'decade', 'yearly', 'quarterly', 'monthly', 'weekly', 'daily', 'hourly', 'task', 'subtask'])
            .optional()
            .describe('Hierarchy level. Defaults to daily.'),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
          area: z.string().optional().describe('Life area, e.g. Business, Health, Home.'),
          dueDate: z.string().optional().describe('Due date in YYYY-MM-DD format.'),
        }),
      }),
      createRecord: tool({
        description: 'Add an entry to one of the life modules (knowledge, habit, journal, finance, health, learning, travel, contact).',
        inputSchema: z.object({
          module: z.enum(MODULES),
          title: z.string(),
          body: z.string().optional(),
        }),
      }),
      openTask: tool({
        description: 'Find an existing task by a search phrase and open its workspace drawer.',
        inputSchema: z.object({
          query: z.string().describe('Words to match against task titles.'),
        }),
      }),
      setTheme: tool({
        description: 'Change the visual theme of the app.',
        inputSchema: z.object({
          theme: z.enum(THEMES),
        }),
      }),
      rememberAboutUser: tool({
        description: 'Save a durable preference, habit, working style, or fact about the user so future sessions are personalized.',
        inputSchema: z.object({
          note: z.string().describe('A single concise fact or preference, written in third person, e.g. "Prefers deep-work blocks in the morning".'),
        }),
      }),
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
