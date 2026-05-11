'use client';
import { useMemo, useState } from 'react';
import type { Activity } from '@/lib/types';
import { ACTIVITY_LABELS, dateKey } from '@/lib/dataUtils';

interface Props {
  activities: Activity[];
  selectedTypes: Set<string>;
  today: Date;
}

const ZONE_COLORS = ['#4f8cff', '#3ec9a8', '#f5b942', '#ff7a3d', '#ff4d6d'];

function lerpColor(t: number): string {
  // 0 → surface-3, 0.25+ → lime with increasing opacity
  if (t <= 0) return 'var(--surface-3)';
  const bands = [
    { r: 106, g: 161, b: 36 },  // low (#6aa124 — muted lime)
    { r: 162, g: 214, b: 52 },  // mid
    { r: 196, g: 242, b: 78 },  // high = accent
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
  acts: string[];
  key: string;
}

interface Tooltip {
  day: DayData;
  col: number;
  row: number;
}

export default function TrainingCalendarSection({ activities, selectedTypes, today }: Props) {
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
        maxTrimp = Math.max(maxTrimp, trimp);
        week.push({ date, trimp, acts: data?.acts ?? [], key: k });
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

  const cellSize = 12;
  const gap = 3;
  const stride = cellSize + gap;
  const padLeft = 22;
  const padTop = 22;

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">
          Training Calendar
          <span className="info" title="Daily TRIMP totals across the past 12 months. Darker = higher training load.">i</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-subtle)' }}>
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <span key={t} style={{
              width: cellSize, height: cellSize, borderRadius: 3,
              background: t === 0 ? 'var(--surface-3)' : lerpColor(t),
              display: 'inline-block', flexShrink: 0,
            }} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ position: 'relative', width: padLeft + weeks.length * stride, height: padTop + 7 * stride + 4, minWidth: 200 }}>
          {/* Month labels */}
          {monthLabels.map(({ col, label }) => (
            <span key={col} style={{
              position: 'absolute',
              left: padLeft + col * stride,
              top: 0,
              fontSize: 10,
              color: 'var(--text-subtle)',
              fontFamily: 'var(--font-mono)',
            }}>{label}</span>
          ))}

          {/* Day labels */}
          {[1, 3, 5].map(d => (
            <span key={d} style={{
              position: 'absolute',
              left: 0, top: padTop + d * stride + (cellSize - 10) / 2,
              fontSize: 9, color: 'var(--text-subtle)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1,
            }}>{DAYS[d]}</span>
          ))}

          {/* Cells */}
          {weeks.map((week, col) =>
            week.map((day, row) => {
              const isFuture = day.date > today;
              const t = isFuture || maxTrimp === 0 ? 0 : Math.min(1, day.trimp / (maxTrimp * 0.8));
              const bg = day.trimp > 0 ? lerpColor(Math.max(0.15, t)) : 'var(--surface-3)';
              return (
                <div
                  key={day.key}
                  onMouseEnter={() => !isFuture ? setTooltip({ day, col, row }) : undefined}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    position: 'absolute',
                    left: padLeft + col * stride,
                    top: padTop + row * stride,
                    width: cellSize, height: cellSize,
                    borderRadius: 3,
                    background: isFuture ? 'var(--surface-2)' : bg,
                    opacity: isFuture ? 0.3 : 1,
                    cursor: day.trimp > 0 ? 'default' : undefined,
                    transition: 'opacity 0.1s',
                  }}
                />
              );
            })
          )}

          {/* Tooltip */}
          {tooltip && tooltip.day.trimp > 0 && (
            <div className="tt" style={{
              position: 'absolute',
              left: padLeft + tooltip.col * stride + cellSize / 2,
              top: padTop + tooltip.row * stride - 8,
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'none',
              zIndex: 20,
            }}>
              <h5 style={{ marginBottom: 4 }}>
                {tooltip.day.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </h5>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 3 }}>
                TRIMP {Math.round(tooltip.day.trimp)}
              </div>
              {tooltip.day.acts.slice(0, 4).map((a, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a}</div>
              ))}
              {tooltip.day.acts.length > 4 && (
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>+{tooltip.day.acts.length - 4} more</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
