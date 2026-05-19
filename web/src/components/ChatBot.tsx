'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

const REMEMBER_RE = /^(?:please\s+)?(?:remember|note|keep in mind)(?:\s+that)?\s*[:\-]?\s*(.+)/i;
const FORGET_RE   = /^(?:please\s+)?(?:forget|clear|delete|remove)\s+(?:everything|all|your\s+(?:notes?|memory))/i;

function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] || type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function buildDashboardContext(
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

  const recent = [...activities]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 20);

  const recentStr = recent.map(a => {
    const parts: string[] = [
      a.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
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

  // Note the current dashboard filter for reference only — does not limit data access
  const filterNote = `Dashboard currently filtered to ${from.toLocaleDateString()} – ${to.toLocaleDateString()} (${filtered.length} activities shown), but you have full all-time access via the CSV data.`;

  return `=== CURRENT DASHBOARD FILTER (for reference only) ===
${filterNote}

${rec.chatContext}

=== MOST RECENT 20 ACTIVITIES (all-time) ===
${recentStr}`;
}


export default function ChatBot({ isOpen, onClose, activities, filtered, today, from, to, selectedTypes, restDate }: Props) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [model, setModel]         = useState<ModelId>('gpt-5.4-mini');
  const [notes, setNotes]         = useState<string[]>(() =>
    typeof window !== 'undefined' ? loadNotes() : []
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  function addNote(note: string) {
    const updated = [...notes, note.trim()];
    setNotes(updated);
    persistNotes(updated);
  }

  function clearNotes() {
    setNotes([]);
    persistNotes([]);
  }

  const dashboardContext = useMemo(() =>
    buildDashboardContext(activities, filtered, today, from, to, selectedTypes, restDate),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [activities.length, today.getTime(), from.getTime(), to.getTime(), filtered.length, restDate]);

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
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const rememberMatch = REMEMBER_RE.exec(trimmed);
    if (rememberMatch) addNote(rememberMatch[1]);
    if (FORGET_RE.test(trimmed)) clearNotes();

    const nextMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: nextMessages.slice(-14).map(m => ({ role: m.role, content: m.content })),
          dashboardContext,
          notes,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? res.statusText);
      }

      const reader  = res.body!.getReader();
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
          content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
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
      <div
        className={`chat-backdrop${isOpen ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className={`chat-panel${isOpen ? ' open' : ''}`} role="dialog" aria-label="Coach AI">
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
                  ? (
                    <div className="chat-md">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({ children }) => (
                            <div className="table-wrap"><table>{children}</table></div>
                          ),
                        }}
                      >{msg.content}</ReactMarkdown>
                    </div>
                  )
                  : streaming && i === messages.length - 1
                    ? <span className="chat-cursor" />
                    : null}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

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
