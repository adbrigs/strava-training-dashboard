'use client';
import { useRef, useState, useEffect } from 'react';
import { ACTIVITY_COLORS, ACTIVITY_LABELS } from '@/lib/dataUtils';
import Icon from './ui/Icon';
import Seg from './ui/Seg';

const PRESETS = [
  { id: '7d',    label: '7d',   days: 7 },
  { id: '30d',   label: '30d',  days: 30 },
  { id: '60d',   label: '60d',  days: 60 },
  { id: '90d',   label: '90d',  days: 90 },
  { id: 'ytd',   label: 'YTD' },
  { id: 'all',   label: 'All' },
  { id: 'custom',label: 'Custom' },
];

interface Props {
  today: Date;
  from: Date;
  to: Date;
  rangePreset: string;
  onPreset: (id: string, from: Date, to: Date) => void;
  onCustomRange: (from: Date, to: Date) => void;
  activityTypes: string[];
  selectedTypes: Set<string>;
  onTypeToggle: (t: string) => void;
  onSelectAll: () => void;
  period: 'weekly' | 'monthly';
  onPeriod: (p: 'weekly' | 'monthly') => void;
}

export default function FilterBar({
  today, from, to, rangePreset, onPreset, onCustomRange,
  activityTypes, selectedTypes, onTypeToggle, onSelectAll,
  period, onPeriod,
}: Props) {
  const [actOpen, setActOpen] = useState(false);
  const actRef = useRef<HTMLDivElement>(null);

  // Custom date strings (yyyy-MM-dd for input[type=date])
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Sync custom inputs when switching to custom preset
  useEffect(() => {
    if (rangePreset === 'custom') {
      setCustomFrom(toInputDate(from));
      setCustomTo(toInputDate(to));
    }
  }, [rangePreset]); // only when switching to custom

  // Close activity dropdown on outside click
  useEffect(() => {
    if (!actOpen) return;
    const close = (e: MouseEvent) => {
      if (!actRef.current?.contains(e.target as Node)) setActOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [actOpen]);

  function toInputDate(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  function applyPreset(p: typeof PRESETS[number]) {
    if (p.id === 'custom') {
      // Switch to custom mode, keep current range
      onPreset('custom', from, to);
      setCustomFrom(toInputDate(from));
      setCustomTo(toInputDate(to));
      return;
    }
    let newFrom: Date;
    if (p.id === 'ytd') {
      newFrom = new Date(today.getFullYear(), 0, 1);
    } else if (p.id === 'all') {
      newFrom = new Date(today.getFullYear() - 2, 0, 1);
    } else {
      newFrom = new Date(today);
      newFrom.setDate(newFrom.getDate() - (p.days ?? 60) + 1);
    }
    newFrom.setHours(0, 0, 0, 0);
    onPreset(p.id, newFrom, today);
  }

  function handleCustomFrom(val: string) {
    setCustomFrom(val);
    if (!val) return;
    const d = new Date(val + 'T00:00:00');
    if (!isNaN(d.getTime())) onCustomRange(d, to);
  }

  function handleCustomTo(val: string) {
    setCustomTo(val);
    if (!val) return;
    const d = new Date(val + 'T23:59:59');
    if (!isNaN(d.getTime())) onCustomRange(from, d);
  }

  // Activity dropdown label: show up to 4 selected
  const allSelected = activityTypes.every(t => selectedTypes.has(t));
  const noneSelected = activityTypes.every(t => !selectedTypes.has(t));
  const selectedList = activityTypes.filter(t => selectedTypes.has(t));

  let actLabel: string;
  if (allSelected) {
    actLabel = 'All Activities';
  } else if (noneSelected) {
    actLabel = 'No Activities';
  } else {
    const shown = selectedList.slice(0, 4).map(t => ACTIVITY_LABELS[t] || t);
    const extra = selectedList.length - shown.length;
    actLabel = shown.join(', ') + (extra > 0 ? ` +${extra}` : '');
  }

  return (
    <div className="filterbar" style={{ gap: 10 }}>
      {/* Preset quick-select buttons */}
      <div className="filter-group" style={{ gap: 4 }}>
        <div className="seg">
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              className={rangePreset === p.id ? 'on' : ''}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date inputs — shown inline when custom selected */}
      {rangePreset === 'custom' && (
        <div className="custom-date-row">
          <input
            type="date"
            className="custom-date-input"
            value={customFrom}
            onChange={e => handleCustomFrom(e.target.value)}
          />
          <span className="custom-date-arrow">→</span>
          <input
            type="date"
            className="custom-date-input"
            value={customTo}
            onChange={e => handleCustomTo(e.target.value)}
          />
        </div>
      )}

      {/* Period toggle — right next to date range */}
      <Seg
        value={period}
        onChange={v => onPeriod(v as 'weekly' | 'monthly')}
        options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]}
      />

      {/* Activity dropdown */}
      <div ref={actRef} className="activity-filter">
        <button
          type="button"
          className="date-pill"
          onClick={() => setActOpen(o => !o)}
          style={{ gap: 6 }}
        >
          {/* Color dots for first 4 selected */}
          <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {selectedList.slice(0, 4).map(t => (
              <span
                key={t}
                style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: ACTIVITY_COLORS[t] || '#94a3b8',
                  flexShrink: 0,
                }}
              />
            ))}
          </span>
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 180,
          }}>
            {actLabel}
          </span>
          <Icon name="chev" size={12} className="chev" style={{ flexShrink: 0 }} />
        </button>

        {actOpen && (
          <div className="activity-menu">
            {/* Select All row */}
            <button
              type="button"
              onClick={onSelectAll}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px', borderRadius: 7, fontSize: 12.5,
                color: allSelected ? 'var(--text)' : 'var(--text-muted)',
                background: allSelected ? 'var(--surface-2)' : 'transparent',
                fontWeight: 600,
              }}
            >
              <span>Select All</span>
              {allSelected && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)', margin: '2px 4px' }} />

            {/* Activity rows */}
            {activityTypes.map(t => {
              const on = selectedTypes.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTypeToggle(t)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 7, fontSize: 13,
                    color: on ? 'var(--text)' : 'var(--text-muted)',
                    background: on ? 'var(--surface-2)' : 'transparent',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: ACTIVITY_COLORS[t] || '#94a3b8',
                      flexShrink: 0,
                      opacity: on ? 1 : 0.4,
                    }} />
                    {ACTIVITY_LABELS[t] || t}
                  </span>
                  {on && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
