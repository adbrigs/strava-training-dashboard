'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import type { Activity } from '@/lib/types';
import { recommendWorkout } from '@/lib/recommendation';
import { ACTIVITY_LABELS } from '@/lib/dataUtils';
import Icon from './ui/Icon';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activities: Activity[];
  filtered: Activity[];
  today: Date;
  from: Date;
  to: Date;
  selectedTypes: Set<string>;
  restDate: string | null;
}

const MODELS = [
  { id: 'gpt-5.5',      label: 'GPT-5.5' },
  { id: 'gpt-5.4',      label: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
] as const;
type ModelId = typeof MODELS[number]['id'];

const SUGGESTIONS = [
  'How is my fitness trending?',
  'Am I overtraining?',
  'What should I focus on this week?',
  'Break down my recent training',
];

const NOTES_KEY = 'coach_notes';

function loadNotes(): string[] {
  try {
    const s = localStorage.getItem(NOTES_KEY);
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

function persistNotes(notes: string[]) {
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch {}
}

// Matches "remember [that] [: ] ..." and "note [that] [: ] ..."
const REMEMBER_RE = /^(?:please\s+)?(?:remember|note|keep in mind)(?:\s+that)?\s*[:\-]?\s*(.+)/i;
const FORGET_RE   = /^(?:please\s+)?(?:forget|clear|delete|remove)\s+(?:everything|all|your\s+(?:notes?|memory))/i;

function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] || type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function buildSystemPrompt(
  activities: Activity[],
  filtered: Activity[],
  today: Date,
  from: Date,
  to: Date,
  selectedTypes: Set<string>,
  restDate: string | null,
): string {
  const rec = recommendWorkout(
    activities.filter(a => selectedTypes.has(a.type)),
    today,
    restDate,
  );

  const typeCounts: Record<string, number> = {};
  filtered.forEach(a => { typeCounts[a.type] = (typeCounts[a.type] || 0) + 1; });
  const breakdown = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${activityLabel(t)}: ${n}`)
    .join(', ');

  const totalDist = filtered.reduce((s, a) => s + a.distance, 0);
  const totalTime = filtered.reduce((s, a) => s + a.duration, 0);
  const totalTrimp = filtered.reduce((s, a) => s + a.trimp, 0);

  const recent = [...activities]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 12);

  const recentStr = recent.map(a => {
    const parts: string[] = [
      a.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      activityLabel(a.type),
    ];
    if (a.distance > 0.1) parts.push(`${a.distance.toFixed(1)} mi`);
    parts.push(`${Math.round(a.duration)} min`);
    if (a.pace) {
      const m = Math.floor(a.pace);
      const s = String(Math.round((a.pace - m) * 60)).padStart(2, '0');
      parts.push(`${m}:${s}/mi`);
    }
    if (a.avgHr > 0) parts.push(`HR ${Math.round(a.avgHr)}`);
    parts.push(`${Math.round(a.trimp)} TRIMP`);
    return parts.join(' · ');
  }).join('\n');

  return `You are a personal fitness coach AI embedded in Andrew's Strava training dashboard. You have full access to his training data and can give specific, data-backed advice.

=== ABOUT ANDREW ===
- Follows a push/pull/legs split for weight training
- Primary goal: improve cardiovascular health while continuing to weight train

${rec.chatContext}

=== DASHBOARD VIEW (${from.toLocaleDateString()} – ${to.toLocaleDateString()}) ===
Activities: ${filtered.length} | Breakdown: ${breakdown || 'none'}
Distance: ${totalDist.toFixed(1)} mi | Time: ${(totalTime / 60).toFixed(1)} hrs | Load: ${Math.round(totalTrimp)} TRIMP

=== RECENT ACTIVITIES (last 12) ===
${recentStr}

Be concise and specific. Reference Andrew's actual numbers. Keep replies under 200 words unless a detailed breakdown is clearly needed. Today is ${today.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
}

function renderContent(text: string) {
  return text.split('\n').map((line, i, arr) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={i}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : p
        )}
        {i < arr.length - 1 && <br />}
      </span>
    );
  });
}

export default function ChatBot({ isOpen, onClose, activities, filtered, today, from, to, selectedTypes, restDate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState<ModelId>('gpt-5.4-mini');
  const [notes, setNotes] = useState<string[]>(() =>
    typeof window !== 'undefined' ? loadNotes() : []
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function addNote(note: string) {
    const updated = [...notes, note.trim()];
    setNotes(updated);
    persistNotes(updated);
  }

  function clearNotes() {
    setNotes([]);
    persistNotes([]);
  }

  const systemPrompt = useMemo(() => {
    const base = buildSystemPrompt(activities, filtered, today, from, to, selectedTypes, restDate);
    const noteBlock = notes.length > 0
      ? `\n\n=== REMEMBERED PREFERENCES ===\n${notes.map(n => `- ${n}`).join('\n')}\n(These were saved by Andrew in previous sessions.)`
      : '';
    const memoryInstruction = `\n\nMemory: When the user says "remember [X]", confirm you've saved it with a brief reply. When asked to forget everything, confirm it's cleared.`;
    return base + noteBlock + memoryInstruction;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities.length, filtered.length, today.getTime(), from.getTime(), to.getTime(), restDate, notes]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 320);
  }, [isOpen]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  async function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || streaming) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Handle memory commands client-side before sending to OpenAI
    const rememberMatch = REMEMBER_RE.exec(trimmed);
    if (rememberMatch) addNote(rememberMatch[1]);
    if (FORGET_RE.test(trimmed)) clearNotes();

    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    const nextMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setStreaming(true);

    if (!apiKey) {
      setMessages([...nextMessages, {
        role: 'assistant',
        content: 'No OpenAI API key found. Add NEXT_PUBLIC_OPENAI_API_KEY to your environment variables to enable the coach.',
      }]);
      setStreaming(false);
      return;
    }

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          max_completion_tokens: 1000,
          messages: [
            { role: 'system', content: systemPrompt },
            // Keep last 10 messages for context window efficiency
            ...nextMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const delta = JSON.parse(data).choices[0]?.delta?.content;
            if (delta) {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + delta,
                };
                return updated;
              });
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}. Check your API key and try again.`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Backdrop (mobile only) */}
      <div
        className={`chat-backdrop${isOpen ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className={`chat-panel${isOpen ? ' open' : ''}`} role="dialog" aria-label="Coach AI">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-title">
            <div className="chat-avatar">
              <Icon name="bolt" size={14} />
            </div>
            <div>
              <div className="chat-header-name">Coach AI</div>
              <select
                className="chat-model-select"
                value={model}
                onChange={e => setModel(e.target.value as ModelId)}
                disabled={streaming}
                aria-label="Select model"
              >
                {MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          {notes.length > 0 && (
            <span className="chat-memory-badge" title={`${notes.length} saved note${notes.length > 1 ? 's' : ''}:\n${notes.join('\n')}`}>
              {notes.length} note{notes.length > 1 ? 's' : ''}
            </span>
          )}
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close chat">
            <Icon name="x" size={15} />
          </button>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {isEmpty ? (
            <div className="chat-empty">
              <p>Ask me anything about your training data.</p>
              <div className="chat-suggestions">
                {SUGGESTIONS.map(s => (
                  <button key={s} className="chat-suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                {msg.content
                  ? renderContent(msg.content)
                  : streaming && i === messages.length - 1
                    ? <span className="chat-cursor" />
                    : null}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach…"
            rows={1}
            disabled={streaming}
          />
          <button
            className="chat-send"
            onClick={() => send(input)}
            disabled={!input.trim() || streaming}
            title="Send"
            aria-label="Send message"
          >
            <Icon name="send" size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
