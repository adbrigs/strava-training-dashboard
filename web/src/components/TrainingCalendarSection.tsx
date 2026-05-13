'use client';
import { useMemo, useRef, useState } from 'react';
import type { Activity } from '@/lib/types';
import { ACTIVITY_LABELS, dateKey } from '@/lib/dataUtils';

interface Props {
  activities: Activity[];
  selectedTypes: Set<string>;
  today: Date;
}

// Blue sequential scale — safe for all types of color blindness
function lerpColor(t: number): string {
  if (t <= 0) return 'var(--surface-3)';
  // low → muted navy, mid → bright blue, high → light sky
  const bands = [
    { r: 30,  g: 64,  b: 130 }, // #1e4082 dark navy
    { r: 59,  g: 130, b: 246 }, // #3b82f6 blue
    { r: 147, g: 197, b: 253 }, // #93c5fd light sky
  ];
  const idx = t < 0.5 ? 0 : 1;
  const tt = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const a = bands[idx], b = bands[idx + 1];
  const r = Math.round(a.r + (b.r - a.r) * tt);
  const g = Math.round(a.g + (b.g - a.g) * tt);
  const bv = Math.round(a.b + (b.b - a.b) * tt);
  return `rgb(${r},${g},${bv})`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface DayData {
  date: Date;
  trimp: number;
  ctl: number;
  atl: number;
  tsb: number;
  acts: string[];
  key: string;
}

interface Tooltip {
  day: DayData;
  x: number;
  y: number;
  placement: 'above' | 'below';
}

type CalendarMode = 'load' | 'form';

export default function TrainingCalendarSection({ activities, selectedTypes, today }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CalendarMode>('load');
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  // Build 52-week grid ending at today
  const { weeks, maxTrimp } = useMemo(() => {
    const todaySunday = new Date(today);
    todaySunday.setDate(todaySunday.getDate() - todaySunday.getDay()); // back to Sunday
    todaySunday.setHours(0, 0, 0, 0);

    const startSunday = new Date(todaySunday);
    startSunday.setDate(startSunday.getDate() - 52 * 7);

    // Build day → {trimp, acts} map
    const dayMap = new Map<string, { trimp: number; acts: string[] }>();
    activities.forEach(a => {
      if (!selectedTypes.has(a.type)) return;
      const k = dateKey(a.date);
      const e = dayMap.get(k) || { trimp: 0, acts: [] };
      e.trimp += a.trimp;
      e.acts.push(ACTIVITY_LABELS[a.type] || a.type);
      dayMap.set(k, e);
    });

    const dailyForm = new Map<string, { ctl: number; atl: number; tsb: number }>();
    const firstActivity = activities
      .filter(a => selectedTypes.has(a.type) && a.date <= today)
      .reduce<Date | null>((earliest, a) => !earliest || a.date < earliest ? a.date : earliest, null);
    const formStart = new Date(firstActivity ?? startSunday);
    formStart.setHours(0, 0, 0, 0);
    if (formStart > startSunday) formStart.setTime(startSunday.getTime());

    let ctl = 30;
    let atl = 30;
    const ctlA = 2 / (42 + 1);
    const atlA = 2 / (7 + 1);
    for (let d = new Date(formStart); d <= today; d.setDate(d.getDate() + 1)) {
      const k = dateKey(d);
      const t = dayMap.get(k)?.trimp || 0;
      ctl = ctl + ctlA * (t - ctl);
      atl = atl + atlA * (t - atl);
      dailyForm.set(k, { ctl, atl, tsb: ctl - atl });
    }

    let maxTrimp = 0;
    const weeks: DayData[][] = [];
    for (let w = 0; w < 53; w++) {
      const week: DayData[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(startSunday);
        date.setDate(date.getDate() + w * 7 + d);
        const k = dateKey(date);
        const data = dayMap.get(k);
        const trimp = data?.trimp ?? 0;
        const form = dailyForm.get(k) ?? { ctl: 0, atl: 0, tsb: 0 };
        maxTrimp = Math.max(maxTrimp, trimp);
        week.push({ date, trimp, acts: data?.acts ?? [], key: k, ...form });
      }
      weeks.push(week);
    }
    return { weeks, maxTrimp };
  }, [activities, selectedTypes, today]);

  // Month labels: find which column each new month starts in
  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, col) => {
      const m = week[0].date.getMonth();
      if (m !== lastMonth) { labels.push({ col, label: MONTHS[m] }); lastMonth = m; }
    });
    return labels;
  }, [weeks]);

  const mobileWeeks = useMemo(() => weeks.slice(-20), [weeks]);
  const mobileMonthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    mobileWeeks.forEach((week, col) => {
      const m = week[0].date.getMonth();
      if (m !== lastMonth) { labels.push({ col, label: MONTHS[m] }); lastMonth = m; }
    });
    return labels;
  }, [mobileWeeks]);

  const cellSize = 10;
  const gap = 3;
  const stride = cellSize + gap;
  const padLeft = 20;
  const padTop = 18;
  const formColor = (tsb: number) => {
    if (tsb < -30) return 'var(--hot)';
    if (tsb < -10) return 'var(--warn)';
    if (tsb <= 5) return 'var(--accent)';
    if (tsb <= 25) return 'var(--z2)';
    return '#93c5fd';
  };
  const modeTitle = mode === 'load'
    ? 'Daily TRIMP totals across the past 12 months. Darker = higher training load.'
    : 'Daily training form. Negative = fatigued, near zero = productive, positive = fresh.';

  return (
    <div ref={cardRef} className="card calendar-card fade-in">
      <div className="card-head">
        <div className="calendar-title-group">
          <div className="card-title">
            Training Calendar
            <span className="info" title={modeTitle}>i</span>
          </div>
          <div className="seg calendar-mode" aria-label="Calendar metric">
            {(['load', 'form'] as CalendarMode[]).map(m => (
              <button
                key={m}
                className={mode === m ? 'on' : ''}
                onClick={() => { setMode(m); setTooltip(null); }}
              >
                {m === 'load' ? 'Load' : 'Form'}
              </button>
            ))}
          </div>
        </div>
        <div className="calendar-scale">
          {mode === 'load' ? (
            <>
              <span>Less</span>
              {[0, 0.25, 0.5, 0.75, 1].map(t => (
                <span key={t} style={{
                  width: cellSize, height: cellSize, borderRadius: 3,
                  background: t === 0 ? 'var(--surface-3)' : lerpColor(t),
                  display: 'inline-block', flexShrink: 0,
                }} />
              ))}
              <span>More</span>
            </>
          ) : (
            <>
              <span>Fatigued</span>
              {[-35, -18, 0, 12, 30].map(v => (
                <span key={v} style={{
                  width: cellSize, height: cellSize, borderRadius: 3,
                  background: formColor(v),
                  display: 'inline-block', flexShrink: 0,
                }} />
              ))}
              <span>Fresh</span>
            </>
          )}
        </div>
      </div>

      <div className="calendar-scroll calendar-desktop-scroll" style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div className="calendar-grid" style={{ position: 'relative', width: padLeft + weeks.length * stride, height: padTop + 7 * stride + 4, minWidth: 200 }}>
          {/* Month labels */}
          {monthLabels.map(({ col, label }) => (
            <span key={col} style={{
              position: 'absolute',
              left: padLeft + col * stride,
              top: 0,
              fontSize: 9,
              color: 'var(--text-subtle)',
              fontFamily: 'var(--font-mono)',
            }}>{label}</span>
          ))}

          {/* Day labels */}
          {[1, 3, 5].map(d => (
            <span key={d} style={{
              position: 'absolute',
              left: 0, top: padTop + d * stride + (cellSize - 10) / 2,
              fontSize: 8, color: 'var(--text-subtle)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1,
            }}>{DAYS[d]}</span>
          ))}

          {/* Cells */}
          {weeks.map((week, col) =>
            week.map((day, row) => {
              const isFuture = day.date > today;
              const t = isFuture || maxTrimp === 0 ? 0 : Math.min(1, day.trimp / (maxTrimp * 0.8));
              const bg = mode === 'form'
                ? formColor(day.tsb)
                : day.trimp > 0 ? lerpColor(Math.max(0.15, t)) : 'var(--surface-3)';
              return (
                <div
                  key={day.key}
                  onMouseEnter={(event) => {
                    if (isFuture) return;
                    const cardRect = cardRef.current?.getBoundingClientRect();
                    const cellRect = event.currentTarget.getBoundingClientRect();
                    if (!cardRect) return;
                    setTooltip({
                      day,
                      x: cellRect.left - cardRect.left + cellRect.width / 2,
                      y: row <= 1 ? cellRect.bottom - cardRect.top + 12 : cellRect.top - cardRect.top - 12,
                      placement: row <= 1 ? 'below' : 'above',
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    position: 'absolute',
                    left: padLeft + col * stride,
                    top: padTop + row * stride,
                    width: cellSize, height: cellSize,
                    borderRadius: 3,
                    background: isFuture ? 'var(--surface-2)' : bg,
                    opacity: isFuture ? 0.3 : 1,
                    cursor: mode === 'form' || day.trimp > 0 ? 'default' : undefined,
                    transition: 'opacity 0.1s',
                  }}
                />
              );
            })
          )}

        </div>
      </div>

      <div className="calendar-mobile-view">
        <div className="calendar-mobile-caption">Recent 20 weeks</div>
        <div className="calendar-mobile-grid" style={{ position: 'relative', width: padLeft + mobileWeeks.length * stride, height: padTop + 7 * stride + 4 }}>
          {mobileMonthLabels.map(({ col, label }) => (
            <span key={col} style={{
              position: 'absolute',
              left: padLeft + col * stride,
              top: 0,
              fontSize: 9,
              color: 'var(--text-subtle)',
              fontFamily: 'var(--font-mono)',
            }}>{label}</span>
          ))}

          {[1, 3, 5].map(d => (
            <span key={d} style={{
              position: 'absolute',
              left: 0, top: padTop + d * stride + (cellSize - 10) / 2,
              fontSize: 8, color: 'var(--text-subtle)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1,
            }}>{DAYS[d]}</span>
          ))}

          {mobileWeeks.map((week, col) =>
            week.map((day, row) => {
              const isFuture = day.date > today;
              const t = isFuture || maxTrimp === 0 ? 0 : Math.min(1, day.trimp / (maxTrimp * 0.8));
              const bg = mode === 'form'
                ? formColor(day.tsb)
                : day.trimp > 0 ? lerpColor(Math.max(0.15, t)) : 'var(--surface-3)';
              return (
                <div
                  key={`mobile-${day.key}`}
                  onMouseEnter={(event) => {
                    if (isFuture) return;
                    const cardRect = cardRef.current?.getBoundingClientRect();
                    const cellRect = event.currentTarget.getBoundingClientRect();
                    if (!cardRect) return;
                    setTooltip({
                      day,
                      x: cellRect.left - cardRect.left + cellRect.width / 2,
                      y: row <= 1 ? cellRect.bottom - cardRect.top + 12 : cellRect.top - cardRect.top - 12,
                      placement: row <= 1 ? 'below' : 'above',
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    position: 'absolute',
                    left: padLeft + col * stride,
                    top: padTop + row * stride,
                    width: cellSize, height: cellSize,
                    borderRadius: 3,
                    background: isFuture ? 'var(--surface-2)' : bg,
                    opacity: isFuture ? 0.3 : 1,
                    cursor: mode === 'form' || day.trimp > 0 ? 'default' : undefined,
                    transition: 'opacity 0.1s',
                  }}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (mode === 'form' || tooltip.day.trimp > 0) && (
        <div className="tt" style={{
          position: 'absolute',
          left: tooltip.x,
          top: tooltip.y,
          transform: tooltip.placement === 'below' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
          pointerEvents: 'none',
          zIndex: 40,
        }}>
          <h5 style={{ marginBottom: 4 }}>
            {tooltip.day.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </h5>
          {mode === 'form' ? (
            <>
              <div style={{ fontSize: 11, color: formColor(tooltip.day.tsb), fontWeight: 600, marginBottom: 3 }}>
                Form {tooltip.day.tsb > 0 ? '+' : ''}{tooltip.day.tsb.toFixed(1)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fitness {tooltip.day.ctl.toFixed(1)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fatigue {tooltip.day.atl.toFixed(1)}</div>
              {tooltip.day.trimp > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 3 }}>
                  TRIMP {Math.round(tooltip.day.trimp)}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 3 }}>
                TRIMP {Math.round(tooltip.day.trimp)}
              </div>
              {tooltip.day.acts.slice(0, 4).map((a, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a}</div>
              ))}
              {tooltip.day.acts.length > 4 && (
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>+{tooltip.day.acts.length - 4} more</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
