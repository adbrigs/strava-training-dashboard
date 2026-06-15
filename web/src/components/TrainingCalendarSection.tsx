'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Activity } from '@/lib/types';
import { ACTIVITY_LABELS, dateKey } from '@/lib/dataUtils';

interface Props {
  activities: Activity[];
  selectedTypes: Set<string>;
  today: Date;
}

interface WhoopEntry {
  recovery?: number;
  hrv?: number;
  restingHr?: number;
  sleepPerformance?: number;
  strain?: number;
}

// Blue sequential scale for load mode
function lerpColor(t: number): string {
  if (t <= 0) return 'var(--surface-3)';
  const bands = [
    { r: 30,  g: 64,  b: 130 },
    { r: 59,  g: 130, b: 246 },
    { r: 147, g: 197, b: 253 },
  ];
  const idx = t < 0.5 ? 0 : 1;
  const tt = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const a = bands[idx], b = bands[idx + 1];
  const r = Math.round(a.r + (b.r - a.r) * tt);
  const g = Math.round(a.g + (b.g - a.g) * tt);
  const bv = Math.round(a.b + (b.b - a.b) * tt);
  return `rgb(${r},${g},${bv})`;
}

function formColor(tsb: number) {
  if (tsb < -30) return 'var(--hot)';
  if (tsb < -10) return 'var(--warn)';
  if (tsb <= 5)  return 'var(--accent)';
  if (tsb <= 25) return 'var(--z2)';
  return '#93c5fd';
}

function recoveryColor(v: number) {
  if (v >= 67) return 'var(--z2)';
  if (v >= 34) return 'var(--warn)';
  return 'var(--hot)';
}
function hrvColor(v: number) {
  if (v >= 60) return 'var(--z2)';
  if (v >= 30) return 'var(--warn)';
  return 'var(--hot)';
}
function restingHrColor(v: number) {
  if (v < 55) return 'var(--z2)';
  if (v < 70) return 'var(--warn)';
  return 'var(--hot)';
}
function sleepColor(v: number) {
  if (v >= 85) return 'var(--z2)';
  if (v >= 70) return 'var(--warn)';
  return 'var(--hot)';
}
function strainColor(v: number) {
  if (v >= 18) return 'var(--hot)';
  if (v >= 14) return 'var(--z4)';
  if (v >= 10) return 'var(--warn)';
  return 'var(--z2)';
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
  recovery?: number;
  hrv?: number;
  restingHr?: number;
  sleepPerformance?: number;
  strain?: number;
}

interface Tooltip {
  day: DayData;
  x: number;
  y: number;
  placement: 'above' | 'below';
}

type CalendarMode = 'recovery' | 'hrv' | 'restingHr' | 'sleep' | 'strain' | 'load' | 'form';

const MODE_LABELS: Record<CalendarMode, string> = {
  recovery: 'Recovery',
  hrv:      'HRV',
  restingHr:'Resting HR',
  sleep:    'Sleep',
  strain:   'Strain',
  load:     'Load',
  form:     'Form',
};
const MODE_ORDER: CalendarMode[] = ['recovery', 'hrv', 'restingHr', 'sleep', 'strain', 'load', 'form'];

function getCellBg(day: DayData, mode: CalendarMode, isFuture: boolean, maxTrimp: number): string {
  if (isFuture) return 'var(--surface-2)';
  switch (mode) {
    case 'load':
      if (day.trimp <= 0) return 'var(--surface-3)';
      return lerpColor(Math.max(0.15, Math.min(1, day.trimp / (maxTrimp * 0.8))));
    case 'form':
      return formColor(day.tsb);
    case 'recovery':
      return day.recovery != null ? recoveryColor(day.recovery) : 'var(--surface-3)';
    case 'hrv':
      return day.hrv != null ? hrvColor(day.hrv) : 'var(--surface-3)';
    case 'restingHr':
      return day.restingHr != null ? restingHrColor(day.restingHr) : 'var(--surface-3)';
    case 'sleep':
      return day.sleepPerformance != null ? sleepColor(day.sleepPerformance) : 'var(--surface-3)';
    case 'strain':
      return day.strain != null ? strainColor(day.strain) : 'var(--surface-3)';
  }
}

function hasTooltip(day: DayData, mode: CalendarMode): boolean {
  switch (mode) {
    case 'load':     return day.trimp > 0;
    case 'form':     return true;
    case 'recovery': return day.recovery != null;
    case 'hrv':      return day.hrv != null || day.restingHr != null;
    case 'restingHr':return day.restingHr != null || day.hrv != null;
    case 'sleep':    return day.sleepPerformance != null;
    case 'strain':   return day.strain != null;
  }
}

export default function TrainingCalendarSection({ activities, selectedTypes, today }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CalendarMode>('recovery');
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [whoopMap, setWhoopMap] = useState<Map<string, WhoopEntry>>(new Map());

  useEffect(() => {
    fetch('/data/whoop_history.json')
      .then(r => r.json())
      .then((records: Array<{ date: string } & WhoopEntry>) => {
        const m = new Map<string, WhoopEntry>();
        records.forEach(({ date, ...rest }) => m.set(date, rest));
        setWhoopMap(m);
      })
      .catch(() => {});
  }, []);

  const { weeks, maxTrimp } = useMemo(() => {
    const todaySunday = new Date(today);
    todaySunday.setDate(todaySunday.getDate() - todaySunday.getDay());
    todaySunday.setHours(0, 0, 0, 0);

    const startSunday = new Date(todaySunday);
    startSunday.setDate(startSunday.getDate() - 52 * 7);

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
        const whoop = whoopMap.get(k) ?? {};
        maxTrimp = Math.max(maxTrimp, trimp);
        week.push({ date, trimp, acts: data?.acts ?? [], key: k, ...form, ...whoop });
      }
      weeks.push(week);
    }
    return { weeks, maxTrimp };
  }, [activities, selectedTypes, today, whoopMap]);

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

  const modeTitle: Record<CalendarMode, string> = {
    load:      'Daily TRIMP totals across the past 12 months. Darker = higher training load.',
    form:      'Daily training form. Negative = fatigued, near zero = productive, positive = fresh.',
    recovery:  'Daily WHOOP recovery score. Green ≥67%, Yellow 34–66%, Red <34%.',
    hrv:       'Daily WHOOP HRV. Green ≥60ms, Yellow 30–60ms, Red <30ms.',
    restingHr: 'Daily WHOOP resting heart rate. Green <55bpm, Yellow 55–70bpm, Red ≥70bpm.',
    sleep:     'Daily WHOOP sleep performance. Green ≥85%, Yellow 70–85%, Red <70%.',
    strain:    'Daily WHOOP strain score. Green light (<10), Yellow moderate (10–14), Orange high (14–18), Red all out (≥18).',
  };

  function renderScale() {
    const dot = (color: string) => (
      <span style={{ width: cellSize, height: cellSize, borderRadius: 3, background: color, display: 'inline-block', flexShrink: 0 }} />
    );
    switch (mode) {
      case 'load':
        return (<>
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map(t => <span key={t}>{dot(t === 0 ? 'var(--surface-3)' : lerpColor(t))}</span>)}
          <span>More</span>
        </>);
      case 'form':
        return (<>
          <span>Fatigued</span>
          {[-35, -18, 0, 12, 30].map(v => <span key={v}>{dot(formColor(v))}</span>)}
          <span>Fresh</span>
        </>);
      case 'recovery':
      case 'sleep':
        return (<>
          {dot('var(--hot)')} <span>Low</span>
          {dot('var(--warn)')} <span>Mid</span>
          {dot('var(--z2)')} <span>High</span>
        </>);
      case 'hrv':
        return (<>
          {dot('var(--hot)')} <span>&lt;30ms</span>
          {dot('var(--warn)')} <span>30–60ms</span>
          {dot('var(--z2)')} <span>≥60ms</span>
        </>);
      case 'restingHr':
        return (<>
          {dot('var(--z2)')} <span>&lt;55bpm</span>
          {dot('var(--warn)')} <span>55–70</span>
          {dot('var(--hot)')} <span>≥70bpm</span>
        </>);
      case 'strain':
        return (<>
          {dot('var(--z2)')} <span>Light</span>
          {dot('var(--warn)')} <span>Mod</span>
          {dot('var(--z4)')} <span>High</span>
          {dot('var(--hot)')} <span>All Out</span>
        </>);
    }
  }

  function renderTooltipBody(day: DayData) {
    switch (mode) {
      case 'load':
        return (<>
          <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 3 }}>
            TRIMP {Math.round(day.trimp)}
          </div>
          {day.acts.slice(0, 4).map((a, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a}</div>
          ))}
          {day.acts.length > 4 && (
            <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>+{day.acts.length - 4} more</div>
          )}
        </>);
      case 'form':
        return (<>
          <div style={{ fontSize: 11, color: formColor(day.tsb), fontWeight: 600, marginBottom: 3 }}>
            Form {day.tsb > 0 ? '+' : ''}{day.tsb.toFixed(1)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fitness {day.ctl.toFixed(1)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fatigue {day.atl.toFixed(1)}</div>
          {day.trimp > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 3 }}>
              TRIMP {Math.round(day.trimp)}
            </div>
          )}
        </>);
      case 'recovery':
        return (<>
          {day.recovery != null && <div style={{ fontSize: 11, color: recoveryColor(day.recovery), fontWeight: 600 }}>Recovery {day.recovery}%</div>}
          {day.hrv != null && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>HRV {day.hrv}ms</div>}
          {day.restingHr != null && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Resting HR {day.restingHr} bpm</div>}
        </>);
      case 'hrv':
        return (<>
          {day.hrv != null && <div style={{ fontSize: 11, color: hrvColor(day.hrv), fontWeight: 600 }}>HRV {day.hrv}ms</div>}
          {day.restingHr != null && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Resting HR {day.restingHr} bpm</div>}
          {day.recovery != null && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recovery {day.recovery}%</div>}
        </>);
      case 'restingHr':
        return (<>
          {day.restingHr != null && <div style={{ fontSize: 11, color: restingHrColor(day.restingHr), fontWeight: 600 }}>Resting HR {day.restingHr} bpm</div>}
          {day.hrv != null && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>HRV {day.hrv}ms</div>}
          {day.recovery != null && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recovery {day.recovery}%</div>}
        </>);
      case 'sleep':
        return (<>
          {day.sleepPerformance != null && <div style={{ fontSize: 11, color: sleepColor(day.sleepPerformance), fontWeight: 600 }}>Sleep {day.sleepPerformance}% perf</div>}
        </>);
      case 'strain':
        return (<>
          {day.strain != null && <div style={{ fontSize: 11, color: strainColor(day.strain), fontWeight: 600 }}>Strain {day.strain}/21</div>}
          {day.acts.length > 0 && day.acts.slice(0, 3).map((a, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a}</div>
          ))}
        </>);
    }
  }

  function handleCellEnter(event: React.MouseEvent, day: DayData, row: number) {
    if (day.date > today || !hasTooltip(day, mode)) return;
    const cardRect = cardRef.current?.getBoundingClientRect();
    const cellRect = event.currentTarget.getBoundingClientRect();
    if (!cardRect) return;
    setTooltip({
      day,
      x: cellRect.left - cardRect.left + cellRect.width / 2,
      y: row <= 1 ? cellRect.bottom - cardRect.top + 12 : cellRect.top - cardRect.top - 12,
      placement: row <= 1 ? 'below' : 'above',
    });
  }

  return (
    <div ref={cardRef} className="card calendar-card fade-in">
      <div className="card-head">
        <div className="calendar-title-group">
          <div className="card-title">
            Training Calendar
            <span className="info" title={modeTitle[mode]}>i</span>
          </div>
          <div className="seg calendar-mode" aria-label="Calendar metric">
            {MODE_ORDER.map(m => (
              <button
                key={m}
                className={mode === m ? 'on' : ''}
                onClick={() => { setMode(m); setTooltip(null); }}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="calendar-scale">
          {renderScale()}
        </div>
      </div>

      <div className="calendar-scroll calendar-desktop-scroll" style={{ overflowX: 'auto', paddingBottom: 4, flex: 1, display: 'flex', alignItems: 'center' }}>
        <div className="calendar-grid" style={{ position: 'relative', width: padLeft + weeks.length * stride, height: padTop + 7 * stride + 4, minWidth: 200 }}>
          {monthLabels.map(({ col, label }) => (
            <span key={col} style={{
              position: 'absolute', left: padLeft + col * stride, top: 0,
              fontSize: 9, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)',
            }}>{label}</span>
          ))}

          {[1, 3, 5].map(d => (
            <span key={d} style={{
              position: 'absolute', left: 0, top: padTop + d * stride + (cellSize - 10) / 2,
              fontSize: 8, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', lineHeight: 1,
            }}>{DAYS[d]}</span>
          ))}

          {weeks.map((week, col) =>
            week.map((day, row) => {
              const isFuture = day.date > today;
              const bg = getCellBg(day, mode, isFuture, maxTrimp);
              return (
                <div
                  key={day.key}
                  onMouseEnter={e => handleCellEnter(e, day, row)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    position: 'absolute',
                    left: padLeft + col * stride,
                    top: padTop + row * stride,
                    width: cellSize, height: cellSize,
                    borderRadius: 3,
                    background: bg,
                    opacity: isFuture ? 0.3 : 1,
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
              position: 'absolute', left: padLeft + col * stride, top: 0,
              fontSize: 9, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)',
            }}>{label}</span>
          ))}

          {[1, 3, 5].map(d => (
            <span key={d} style={{
              position: 'absolute', left: 0, top: padTop + d * stride + (cellSize - 10) / 2,
              fontSize: 8, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', lineHeight: 1,
            }}>{DAYS[d]}</span>
          ))}

          {mobileWeeks.map((week, col) =>
            week.map((day, row) => {
              const isFuture = day.date > today;
              const bg = getCellBg(day, mode, isFuture, maxTrimp);
              return (
                <div
                  key={`m-${day.key}`}
                  onMouseEnter={e => handleCellEnter(e, day, row)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    position: 'absolute',
                    left: padLeft + col * stride,
                    top: padTop + row * stride,
                    width: cellSize, height: cellSize,
                    borderRadius: 3,
                    background: bg,
                    opacity: isFuture ? 0.3 : 1,
                    transition: 'opacity 0.1s',
                  }}
                />
              );
            })
          )}
        </div>
      </div>

      {tooltip && hasTooltip(tooltip.day, mode) && (
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
          {renderTooltipBody(tooltip.day)}
        </div>
      )}
    </div>
  );
}
