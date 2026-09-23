'use client';

import { useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import type { AppView, ModuleName, PlannerLevel, Priority } from '@/lib/types';

export type AssistantContext = {
  currentView: string;
  theme: string;
  stats: { tasks: number; done: number; overdue: number; records: number; files: number };
  topTasks: Array<{ title: string; level: string; status: string; priority: string; due: string; area: string }>;
  recentRecords: Array<{ module: string; title: string }>;
  memory: string[];
};

export type AssistantActions = {
  getContext: () => AssistantContext;
  navigate: (view: AppView) => void;
  createTask: (input: { title: string; notes?: string; level?: PlannerLevel; priority?: Priority; area?: string; dueDate?: string }) => void;
  createRecord: (module: ModuleName, title: string, body?: string) => void;
  openTask: (query: string) => { found: boolean; title?: string };
  setTheme: (theme: string) => void;
  remember: (note: string) => void;
};

const SUGGESTIONS = [
  'Plan my week',
  'What should I focus on now?',
  'Add a habit to journal every morning',
  'Take me to my finances',
];

export function AssistantPanel({ actions }: { actions: AssistantActions }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const { messages, sendMessage, status, addToolOutput } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/assistant',
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages, context: actionsRef.current.getContext() },
      }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall({ toolCall }) {
      if (toolCall.dynamic) return;
      const a = actionsRef.current;
      try {
        switch (toolCall.toolName) {
          case 'navigate': {
            const { view } = toolCall.input as { view: AppView };
            a.navigate(view);
            addToolOutput({ tool: 'navigate', toolCallId: toolCall.toolCallId, output: `Opened the ${view} view.` });
            break;
          }
          case 'createTask': {
            const input = toolCall.input as { title: string; notes?: string; level?: PlannerLevel; priority?: Priority; area?: string; dueDate?: string };
            a.createTask(input);
            addToolOutput({ tool: 'createTask', toolCallId: toolCall.toolCallId, output: `Created task "${input.title}".` });
            break;
          }
          case 'createRecord': {
            const { module, title, body } = toolCall.input as { module: ModuleName; title: string; body?: string };
            a.createRecord(module, title, body);
            addToolOutput({ tool: 'createRecord', toolCallId: toolCall.toolCallId, output: `Added ${module} entry "${title}".` });
            break;
          }
          case 'openTask': {
            const { query } = toolCall.input as { query: string };
            const result = a.openTask(query);
            addToolOutput({
              tool: 'openTask',
              toolCallId: toolCall.toolCallId,
              output: result.found ? `Opened task "${result.title}".` : `No task found matching "${query}".`,
            });
            break;
          }
          case 'setTheme': {
            const { theme } = toolCall.input as { theme: string };
            a.setTheme(theme);
            addToolOutput({ tool: 'setTheme', toolCallId: toolCall.toolCallId, output: `Switched theme to ${theme}.` });
            break;
          }
          case 'rememberAboutUser': {
            const { note } = toolCall.input as { note: string };
            a.remember(note);
            addToolOutput({ tool: 'rememberAboutUser', toolCallId: toolCall.toolCallId, output: `Noted: ${note}` });
            break;
          }
        }
      } catch (error) {
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: error instanceof Error ? error.message : 'Action failed.',
        });
      }
    },
  });

  const busy = status === 'submitted' || status === 'streaming';

  function submit(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    void sendMessage({ text: value });
    setInput('');
  }

  return (
    <>
      <button className="assistant-fab" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close Qwen assistant' : 'Open Qwen assistant'}>
        {open ? '×' : '✦ Qwen'}
      </button>

      {open && (
        <section className="assistant-panel" role="dialog" aria-label="Qwen assistant">
          <header className="assistant-head">
            <div>
              <strong>Qwen assistant</strong>
              <small>Plans, navigates, and learns your ways</small>
            </div>
            <button className="assistant-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </header>

          <div className="assistant-log">
            {messages.length === 0 && (
              <div className="assistant-empty">
                <p>Hi Xavier. I can plan, organize, and steer the app for you. Try:</p>
                <div className="assistant-chips">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => submit(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={`assistant-msg ${message.role}`}>
                {message.parts.map((part, index) => {
                  if (part.type === 'text') return <span key={index}>{part.text}</span>;
                  if (part.type.startsWith('tool-')) {
                    const p = part as { state?: string; output?: unknown; errorText?: string };
                    if (p.state === 'output-available') return <em key={index} className="assistant-action">{String(p.output)}</em>;
                    if (p.state === 'output-error') return <em key={index} className="assistant-action error">{p.errorText}</em>;
                    return <em key={index} className="assistant-action pending">Working…</em>;
                  }
                  return null;
                })}
              </div>
            ))}

            {busy && messages[messages.length - 1]?.role === 'user' && (
              <div className="assistant-msg assistant"><span className="assistant-typing">Thinking…</span></div>
            )}
          </div>

          <form
            className="assistant-input"
            onSubmit={(event) => {
              event.preventDefault();
              submit(input);
            }}
          >
            <input
              value={input}
              placeholder="Ask Qwen to plan or navigate…"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault();
                  submit(input);
                }
              }}
            />
            <button type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        </section>
      )}
    </>
  );
}
