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

interface WhoopRecord {
  date: string;
  recovery?: number;
  hrv?: number;
  restingHr?: number;
  sleepMs?: number;
  sleepPerformance?: number;
  strain?: number;
  weightLbs?: number;
}

interface LiveWhoop {
  connected: boolean;
  recovery?: { score: number; hrv: number; restingHr: number; date: string } | null;
  sleep?: { durationMs: number; performance: number; efficiency: number; date: string } | null;
  strain?: { score: number; avgHr: number; date: string } | null;
}

function fmtWhoopHistory(records: WhoopRecord[]): string {
  if (!records.length) return 'No WHOOP history available.';
  return records.map(r => {
    const parts: string[] = [r.date];
    if (r.recovery != null)        parts.push(`Recovery ${r.recovery}`);
    if (r.hrv != null)             parts.push(`HRV ${r.hrv}ms`);
    if (r.restingHr != null)       parts.push(`RHR ${r.restingHr}bpm`);
    if (r.sleepPerformance != null) parts.push(`Sleep ${r.sleepPerformance}%`);
    if (r.sleepMs != null)         parts.push(`${(r.sleepMs / 3600000).toFixed(1)}h`);
    if (r.strain != null)          parts.push(`Strain ${r.strain}`);
    if (r.weightLbs != null)       parts.push(`${r.weightLbs}lbs`);
    return parts.join(' · ');
  }).join('\n');
}

function buildDashboardContext(
  activities: Activity[],
  filtered: Activity[],
  today: Date,
  from: Date,
  to: Date,
  selectedTypes: Set<string>,
  restDate: string | null,
  whoopHistory: WhoopRecord[],
  liveWhoop: LiveWhoop | null,
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

  // Today's live WHOOP scores
  let liveWhoopStr = 'No live WHOOP data (not connected or not yet scored today).';
  if (liveWhoop?.connected) {
    const parts: string[] = [];
    if (liveWhoop.recovery) parts.push(`Recovery ${liveWhoop.recovery.score} · HRV ${liveWhoop.recovery.hrv}ms · RHR ${liveWhoop.recovery.restingHr}bpm`);
    if (liveWhoop.sleep)    parts.push(`Sleep ${(liveWhoop.sleep.durationMs / 3600000).toFixed(1)}h · ${liveWhoop.sleep.performance}% perf`);
    if (liveWhoop.strain)   parts.push(`Day strain ${liveWhoop.strain.score}`);
    liveWhoopStr = parts.length ? parts.join(' | ') : 'Connected but no scores yet today.';
  }

  // Last 90 days of WHOOP history
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recentWhoop = whoopHistory.filter(r => r.date >= cutoffStr).slice(-90);

  // 30-day averages
  const last30 = whoopHistory.filter(r => r.date >= new Date(today.getTime() - 30 * 864e5).toISOString().slice(0, 10));
  function avg(vals: number[]) { return vals.length ? Math.round(vals.reduce((a, b) => a + b) / vals.length) : null; }
  const avgRecovery  = avg(last30.map(r => r.recovery).filter((v): v is number => v != null));
  const avgHrv       = avg(last30.map(r => r.hrv).filter((v): v is number => v != null));
  const avgRhr       = avg(last30.map(r => r.restingHr).filter((v): v is number => v != null));
  const avgSleep     = avg(last30.map(r => r.sleepPerformance).filter((v): v is number => v != null));
  const avgStrain    = last30.map(r => r.strain).filter((v): v is number => v != null);
  const avgStrainVal = avgStrain.length ? parseFloat((avgStrain.reduce((a, b) => a + b) / avgStrain.length).toFixed(1)) : null;

  const whoopSummary = [
    avgRecovery  != null ? `Avg recovery: ${avgRecovery}` : null,
    avgHrv       != null ? `Avg HRV: ${avgHrv}ms` : null,
    avgRhr       != null ? `Avg RHR: ${avgRhr}bpm` : null,
    avgSleep     != null ? `Avg sleep performance: ${avgSleep}%` : null,
    avgStrainVal != null ? `Avg strain: ${avgStrainVal}` : null,
  ].filter(Boolean).join(' · ');

  return `=== CURRENT DASHBOARD FILTER (for reference only) ===
${filterNote}

${rec.chatContext}

=== MOST RECENT 20 ACTIVITIES (all-time) ===
${recentStr}

=== TODAY'S WHOOP SCORES (live) ===
${liveWhoopStr}

=== WHOOP 30-DAY AVERAGES ===
${whoopSummary || 'No data'}

=== WHOOP HISTORY (last 90 days) ===
${fmtWhoopHistory(recentWhoop)}`;
}


export default function ChatBot({ isOpen, onClose, activities, filtered, today, from, to, selectedTypes, restDate }: Props) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [model, setModel]         = useState<ModelId>('gpt-5.4-mini');
  const [notes, setNotes]         = useState<string[]>(() =>
    typeof window !== 'undefined' ? loadNotes() : []
  );
  const [whoopHistory, setWhoopHistory] = useState<WhoopRecord[]>([]);
  const [liveWhoop, setLiveWhoop]       = useState<LiveWhoop | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/data/whoop_history.json')
      .then(r => r.json())
      .then(setWhoopHistory)
      .catch(() => {});
    fetch('/api/whoop/data')
      .then(r => r.json())
      .then(setLiveWhoop)
      .catch(() => {});
  }, []);

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
    buildDashboardContext(activities, filtered, today, from, to, selectedTypes, restDate, whoopHistory, liveWhoop),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [activities.length, today.getTime(), from.getTime(), to.getTime(), filtered.length, restDate, whoopHistory.length, liveWhoop]);

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
