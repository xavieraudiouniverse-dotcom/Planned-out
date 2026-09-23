'use client';

import { useRef, useState } from 'react';
import { localQwenChat } from '@/lib/ai';
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

  const [messages, setMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    parts: Array<{ type: 'text'; text: string }>;
  }>>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  async function sendLocalMessage(text: string) {
    const history = messages.map((message) => ({
      role: message.role,
      content: message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(' ')
    }));

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }]
      }
    ]);

    setBusy(true);

    try {
      const answer = await localQwenChat(
        text,
        actionsRef.current.getContext(),
        history,
        setProgress
      );

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: answer }]
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{
            type: 'text',
            text: error instanceof Error
              ? `Local Qwen error: ${error.message}`
              : 'Local Qwen could not start.'
          }]
        }
      ]);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  function submit(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    void sendLocalMessage(value);
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
              <small>Free local Qwen · runs on your device</small>
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
                  return null;
                })}
              </div>
            ))}

            {busy && messages[messages.length - 1]?.role === 'user' && (
              <div className="assistant-msg assistant"><span className="assistant-typing">{progress || "Starting local Qwen…"}</span></div>
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
