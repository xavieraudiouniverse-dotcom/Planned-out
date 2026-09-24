'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MODEL_OPTIONS,
  serverAIChat,
  type AssistantModelChoice,
} from '@/lib/ai';
import type {
  AppView,
  ModuleName,
  PlannerLevel,
  Priority,
} from '@/lib/types';

export type AssistantContext = {
  currentView: string;
  theme: string;
  stats: {
    tasks: number;
    done: number;
    overdue: number;
    records: number;
    files: number;
  };
  topTasks: Array<{
    title: string;
    level: string;
    status: string;
    priority: string;
    due: string;
    area: string;
  }>;
  recentRecords: Array<{ module: string; title: string }>;
  memory: string[];
};

export type AssistantActions = {
  getContext: () => AssistantContext;
  navigate: (view: AppView) => void;
  createTask: (input: {
    title: string;
    notes?: string;
    level?: PlannerLevel;
    priority?: Priority;
    area?: string;
    dueDate?: string;
  }) => void;
  createRecord: (module: ModuleName, title: string, body?: string) => void;
  openTask: (query: string) => { found: boolean; title?: string };
  setTheme: (theme: string) => void;
  remember: (note: string) => void;
};

type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; text: string }>;
  model?: string;
};

const MODEL_STORAGE_KEY = 'xavier-planner-ai-model-v1';

const SUGGESTIONS = [
  'Plan my week',
  'What should I focus on now?',
  'Break my biggest goal into next actions',
  'Help me prioritize everything overdue',
];

function isModelChoice(value: string): value is AssistantModelChoice {
  return MODEL_OPTIONS.some((option) => option.id === value);
}

export function AssistantPanel({ actions }: { actions: AssistantActions }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] =
    useState<AssistantModelChoice>('auto');

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);

    if (saved && isModelChoice(saved)) {
      setSelectedModel(saved);
    }
  }, []);

  function chooseModel(value: string) {
    if (!isModelChoice(value)) return;

    setSelectedModel(value);
    window.localStorage.setItem(MODEL_STORAGE_KEY, value);
  }

  async function sendMessage(text: string) {
    const history = messages.map((message) => ({
      role: message.role,
      content: message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(' '),
    }));

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      },
    ]);

    setBusy(true);

    try {
      const result = await serverAIChat(
        text,
        actionsRef.current.getContext(),
        history,
        selectedModel,
        setProgress,
      );

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: result.text }],
          model: result.model,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text:
                error instanceof Error
                  ? `Xavier AI error: ${error.message}`
                  : 'Xavier AI is temporarily unavailable.',
            },
          ],
        },
      ]);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  function submit(text: string) {
    const value = text.trim();

    if (!value || busy) return;

    void sendMessage(value);
    setInput('');
  }

  const selected =
    MODEL_OPTIONS.find((option) => option.id === selectedModel) ||
    MODEL_OPTIONS[0];

  return (
    <>
      <button
        className="assistant-fab"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close Xavier AI' : 'Open Xavier AI'}
      >
        {open ? '×' : '✦ AI'}
      </button>

      {open && (
        <section
          className="assistant-panel"
          role="dialog"
          aria-label="Xavier AI assistant"
        >
          <header className="assistant-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>Xavier AI</strong>
              <small>Free cloud AI · no phone GPU required</small>

              <select
                value={selectedModel}
                onChange={(event) => chooseModel(event.target.value)}
                aria-label="Choose AI model"
                style={{
                  width: '100%',
                  marginTop: 8,
                  padding: '7px 9px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: 'var(--card2)',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              >
                {MODEL_OPTIONS.map((option) => (
                  <option value={option.id} key={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              <small title={selected.detail}>{selected.detail}</small>
            </div>

            <button
              className="assistant-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <div className="assistant-log">
            {messages.length === 0 && (
              <div className="assistant-empty">
                <p>
                  Hi Xavier. Choose a model above, or leave it on Auto and I
                  will use the strongest available free option.
                </p>

                <div className="assistant-chips">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => submit(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`assistant-msg ${message.role}`}
              >
                {message.model && message.role === 'assistant' && (
                  <small
                    style={{
                      opacity: 0.72,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: '.04em',
                    }}
                  >
                    {message.model}
                  </small>
                )}

                {message.parts.map((part, index) => {
                  if (part.type === 'text') {
                    return <span key={index}>{part.text}</span>;
                  }

                  return null;
                })}
              </div>
            ))}

            {busy && messages[messages.length - 1]?.role === 'user' && (
              <div className="assistant-msg assistant">
                <span className="assistant-typing">
                  {progress || 'Connecting to free AI…'}
                </span>
              </div>
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
              placeholder="Ask Xavier AI to plan or reason…"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  submit(input);
                }
              }}
            />

            <button type="submit" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
        </section>
      )}
    </>
  );
}
