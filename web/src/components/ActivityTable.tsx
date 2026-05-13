'use client';
import { useState, useMemo } from 'react';
import type { Activity } from '@/lib/types';
import { fmtNum, fmtPace, fmtDateTime, ACTIVITY_LABELS, ACTIVITY_COLORS } from '@/lib/dataUtils';
import Icon from './ui/Icon';

type SortKey = 'date' | 'name' | 'type' | 'distance' | 'duration' | 'pace' | 'avgHr' | 'maxHr' | 'trimp' | 'top1' | 'top2' | 'top3';

const COLS: { k: SortKey; l: string; num?: boolean }[] = [
  { k: 'date',      l: 'Date' },
  { k: 'name',      l: 'Activity' },
  { k: 'type',      l: 'Sport' },
  { k: 'distance',  l: 'Dist (mi)', num: true },
  { k: 'duration',  l: 'Time (min)', num: true },
  { k: 'pace',      l: 'Pace (/mi)', num: true },
  { k: 'top1',      l: 'Zone 1' },
  { k: 'top2',      l: 'Zone 2' },
  { k: 'top3',      l: 'Zone 3' },
  { k: 'avgHr',     l: 'Avg HR',    num: true },
  { k: 'maxHr',     l: 'Max HR',    num: true },
  { k: 'trimp',     l: 'TRIMP',     num: true },
];

const PER_PAGE = 10;

interface Props {
  filtered: Activity[];
}

export default function ActivityTable({ filtered }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: -1 | 1 }>({ k: 'date', dir: -1 });
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = q ? filtered.filter(a => a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q)) : filtered;
    return [...f].sort((a, b) => {
      const av = a[sort.k], bv = b[sort.k];
      if (av == null) return 1; if (bv == null) return -1;
      const av2 = av instanceof Date ? av.getTime() : av;
      const bv2 = bv instanceof Date ? bv.getTime() : bv;
      return (av2 > bv2 ? 1 : av2 < bv2 ? -1 : 0) * sort.dir;
    });
  }, [filtered, query, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const pageRows = rows.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  function setS(k: SortKey) {
    setSort(s => s.k === k ? { k, dir: (s.dir === 1 ? -1 : 1) as -1 | 1 } : { k, dir: -1 });
    setPage(0);
  }

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">Activity Details</div>
        <div className="search">
          <Icon name="search" size={13} />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(0); }}
            placeholder="Filter by activity name…"
          />
        </div>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {COLS.map(c => (
                <th
                  key={c.k}
                  className={`${c.num ? 'num' : ''} ${sort.k === c.k ? 'sorted' : ''}`}
                  onClick={() => setS(c.k)}
                >
                  {c.l} <span className="sort">{sort.k === c.k ? (sort.dir > 0 ? '▲' : '▼') : '↕'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(a => (
              <tr key={a.id}>
                <td className="date">{fmtDateTime(a.date)}</td>
                <td className="name">{a.name}</td>
                <td>
                  <span className="ap" style={{ '--c': ACTIVITY_COLORS[a.type] || a.color } as React.CSSProperties}>
                    <span className="sw" />
                    {ACTIVITY_LABELS[a.type] || a.type}
                  </span>
                </td>
                <td className="num">{a.distance ? fmtNum(a.distance, 2) : '—'}</td>
                <td className="num">{fmtNum(a.duration, 1)}</td>
                <td className="num">{a.pace ? fmtPace(a.pace) : '—'}</td>
                {
                  /* Compute top 3 zones (zone number + minutes) */
                }
                {(() => {
                  const fmtMin = (min?: number) => {
                    if (min == null || isNaN(min) || min <= 0) return '—';
                    return `${Math.round(min)}m`;
                  };
                  const zt = a.zoneTimes || [0,0,0,0,0];
                  const pairs = zt.map((m, i) => ({ zone: i + 1, minutes: Number(m) || 0 }))
                    .filter(p => p.minutes > 0)
                    .sort((x, y) => y.minutes - x.minutes)
                    .slice(0, 3);
                  const cells = [0,1,2].map(i => {
                    const p = pairs[i];
                    return (
                      <td key={i}>
                        {p ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span className="zone-pip" style={{ '--zc': `var(--z${p.zone})` } as React.CSSProperties}>{p.zone}</span>
                            {fmtMin(p.minutes)}
                          </span>
                        ) : '—'}
                      </td>
                    );
                  });
                  return cells;
                })()}
                <td className="num">{a.avgHr ? fmtNum(a.avgHr) : '—'}</td>
                <td className="num">{a.maxHr ? fmtNum(a.maxHr) : '—'}</td>
                <td className="num trimp-cell">{fmtNum(a.trimp, 1)}</td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={COLS.length} style={{ textAlign: 'center', padding: '40px 12px', color: 'var(--text-subtle)' }}>
                  No activities match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span>Showing {rows.length ? page * PER_PAGE + 1 : 0}–{Math.min(rows.length, (page + 1) * PER_PAGE)} of {rows.length}</span>
        <div className="pager">
          <button onClick={() => setPage(0)} disabled={page === 0}>«</button>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>‹</button>
          <span className="at">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>›</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</button>
        </div>
      </div>
    </div>
  );
}
