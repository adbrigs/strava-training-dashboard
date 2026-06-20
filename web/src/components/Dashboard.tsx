'use client';
import { useEffect, useMemo, useState } from 'react';
import { parseActivities, computePRs, fmtDateTime, ACTIVITY_COLORS } from '@/lib/dataUtils';
import type { Activity, PR } from '@/lib/types';
import { useRenames } from '@/lib/useRenames';
import Icon from './ui/Icon';
import FilterBar from './FilterBar';
import SummaryRow from './SummaryRow';
import VolumeSection from './VolumeSection';
import HRZonesSection from './HRZonesSection';
import DistributionSection from './DistributionSection';
import PRsSection from './PRsSection';
import FitnessFatigueSection from './FitnessFatigueSection';
import ActivityTable from './ActivityTable';
import TrainingCalendarSection from './TrainingCalendarSection';
import RunEfficiencySection from './RunEfficiencySection';
import WeekPatternSection from './WeekPatternSection';
import LiftSplitSection from './LiftSplitSection';
import ChatBot from './ChatBot';
import WhoopSection from './WhoopSection';
import WhoopTrendSection from './WhoopTrendSection';
import SettingsDrawer from './SettingsDrawer';

function Loading() {
  return (
    <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-subtle)' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '2px solid var(--accent)', borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <p style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>Loading training data…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function Dashboard() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const { renames, rename } = useRenames();
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('brig_theme') as 'dark' | 'light') ?? 'dark';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [whoopDataVersion, setWhoopDataVersion] = useState(0);

  const [restDate, setRestDate] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('rest_day');
      if (!stored) return null;
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (stored < todayStr) {
        localStorage.removeItem('rest_day');
        return null;
      }
      return stored;
    } catch { return null; }
  });

  function handleRestDateChange(date: string | null) {
    setRestDate(date);
    try {
      if (date) localStorage.setItem('rest_day', date);
      else localStorage.removeItem('rest_day');
    } catch {}
  }

  // Clear expired rest date at midnight
  useEffect(() => {
    if (!restDate) return;
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const ms = midnight.getTime() - now.getTime();
    const t = setTimeout(() => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (restDate < todayStr) handleRestDateChange(null);
    }, ms);
    return () => clearTimeout(t);
  }, [restDate]);

  const [from, setFrom] = useState<Date>(new Date());
  const [to, setTo] = useState<Date>(new Date());
  const [rangePreset, setRangePreset] = useState('week');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [selectedBucket, setSelectedBucket] = useState<{ start: Date; end: Date; label: string } | null>(null);

  // Stable "now" captured once at mount — avoids calling the impure Date.now()
  // during render on every pass.
  const [now] = useState(() => Date.now());

  // activities is already sorted desc by date from the load effect
  const today = useMemo(() => {
    const activityDate = activities.length > 0 ? activities[0].date : new Date(now);
    return new Date(Math.max(activityDate.getTime(), now));
  }, [activities, now]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function handleThemeChange(t: 'dark' | 'light') {
    setTheme(t);
    try { localStorage.setItem('brig_theme', t); } catch {}
  }

  // Auto-trigger backfill when returning from WHOOP OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('whoop') !== 'connected') return;
    // Clean the URL without a reload
    const clean = window.location.pathname + (params.toString().replace('whoop=connected', '').replace(/^&|&$/, '') ? '?' + params.toString().replace('whoop=connected', '').replace(/^&|&$/, '') : '');
    window.history.replaceState({}, '', clean);
    // Kick off backfill so trends + calendar reflect fresh data
    fetch('/api/whoop/backfill', { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.ok) setWhoopDataVersion(v => v + 1); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(
      'https://api.github.com/repos/adbrigs/strava-training-dashboard/actions/workflows/schedule.yml/runs?status=success&per_page=1',
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    )
      .then(r => r.json())
      .then(d => {
        const ts = d.workflow_runs?.[0]?.updated_at;
        if (ts) setLastSync(new Date(ts));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/data/activity_data_with_intensity.csv');
        const text = await res.text();
        const parsed = parseActivities(text);
        parsed.sort((a, b) => b.date.getTime() - a.date.getTime());
        setActivities(parsed);
        if (parsed.length > 0) {
          const now = new Date(Math.max(parsed[0].date.getTime(), Date.now()));
          const sunday = new Date(now);
          sunday.setDate(sunday.getDate() - sunday.getDay());
          sunday.setHours(0, 0, 0, 0);
          const saturday = new Date(sunday);
          saturday.setDate(saturday.getDate() + 6);
          setFrom(sunday);
          setTo(saturday);
          const allTypes = [...new Set(parsed.map(a => a.type))];
          setSelectedTypes(new Set(allTypes.filter(t => t !== 'Walk')));
        }
      } catch (err) {
        console.error('Failed to load activity data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handlePreset(id: string, newFrom: Date, newTo: Date) {
    setSelectedBucket(null);
    if (id === 'custom') {
      setRangePreset('custom');
      return;
    }
    if (id === 'all' && activities.length > 0) {
      const minDate = activities.reduce((m, a) => a.date < m ? a.date : m, activities[0].date);
      setFrom(minDate);
    } else {
      setFrom(newFrom);
    }
    setTo(newTo);
    setRangePreset(id);
  }

  function handleCustomRange(newFrom: Date, newTo: Date) {
    setFrom(newFrom);
    setTo(newTo);
    setRangePreset('custom');
    setSelectedBucket(null);
  }

  function handleSelectAll() {
    const allSelected = presentTypes.every(t => selectedTypes.has(t));
    setSelectedTypes(allSelected ? new Set() : new Set(presentTypes));
  }

  function handleTypeToggle(t: string) {
    setSelectedTypes(prev => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t); else n.add(t);
      return n;
    });
  }

  // Apply localStorage renames on top of raw Strava names
  const namedActivities = useMemo(() =>
    activities.map(a => renames[a.id] ? { ...a, name: renames[a.id] } : a),
  [activities, renames]);

  // Plain computation — the React Compiler auto-memoizes this; a manual useMemo
  // here could not be preserved and forced the whole component out of optimization.
  const presentTypeSet = new Set(namedActivities.map(a => a.type));
  const presentTypes = Object.keys(ACTIVITY_COLORS)
    .filter(t => presentTypeSet.has(t))
    .concat([...presentTypeSet].filter(t => !ACTIVITY_COLORS[t]));

  const filtered = useMemo(() => {
    return namedActivities.filter(a => a.date >= from && a.date <= to && selectedTypes.has(a.type));
  }, [namedActivities, from, to, selectedTypes]);

  const hrActivities = useMemo(() => {
    if (!selectedBucket) return filtered;
    return filtered.filter(a => a.date >= selectedBucket.start && a.date <= selectedBucket.end);
  }, [filtered, selectedBucket]);

  function handleBucketClick(start: Date, end: Date, label: string) {
    setSelectedBucket(prev => prev && prev.start.getTime() === start.getTime() ? null : { start, end, label });
  }

  const prs = useMemo<PR[]>(() => computePRs(filtered, today), [filtered, today]);

  if (loading) return <Loading />;

  return (
    <div className="app">
      {/* Header */}
      <header className="hdr">
        <div className="hdr-l">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static avatar sized via CSS class */}
          <img src="/avatar.jpg" alt="Andrew" className="brand" style={{ objectFit: 'cover' }} />
          <div className="hdr-title">
            <h1>Andrew&apos;s Training</h1>
            <small>
              <span className="dot" />
              Synced {fmtDateTime(lastSync ?? today)}
            </small>
          </div>
        </div>
        <div className="hdr-r">
          <button
            className="chat-toggle"
            title="Coach AI"
            onClick={() => setIsChatOpen(o => !o)}
            data-active={isChatOpen ? 'true' : 'false'}
          >
            <Icon name="chat" size={14} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- small static avatar sized via CSS class */}
          <img
            src="/avatar.jpg"
            alt="Andrew"
            className="avatar"
            title="Settings"
            style={{ objectFit: 'cover', cursor: 'pointer' }}
            onClick={() => setIsSettingsOpen(o => !o)}
          />
        </div>
      </header>

      {/* Filter bar */}
      <FilterBar
        today={today}
        from={from}
        to={to}
        rangePreset={rangePreset}
        onPreset={handlePreset}
        onCustomRange={handleCustomRange}
        activityTypes={presentTypes}
        selectedTypes={selectedTypes}
        onTypeToggle={handleTypeToggle}
        onSelectAll={handleSelectAll}
      />

      {/* KPI metrics row */}
      <div className="stack">
        <SummaryRow
          filtered={filtered}
          allFiltered={namedActivities.filter(a => selectedTypes.has(a.type))}
          from={from}
          to={to}
          today={today}
        />
      </div>

      {/* Daily training + WHOOP readiness */}
      <div className="stack">
        <div className="grid-layout row-daily">
          <WhoopSection />
          <TrainingCalendarSection activities={namedActivities} selectedTypes={selectedTypes} today={today} from={from} to={to} refreshKey={whoopDataVersion} />
        </div>
      </div>

      {/* Volume + HR Zones */}
      <div className="stack">
        <div className="grid-layout row-middle">
          <VolumeSection
            filtered={filtered}
            from={from}
            to={to}
            period={period}
            onPeriod={setPeriod}
            selectedTypes={selectedTypes}
            selectedBucketStart={selectedBucket?.start ?? null}
            onBucketClick={handleBucketClick}
          />
          <HRZonesSection filtered={hrActivities} label={selectedBucket?.label} />
        </div>
      </div>

      {/* Distribution + PRs */}
      <div className="stack">
        <div className="grid-layout row-donuts">
          <DistributionSection filtered={filtered} />
          <PRsSection prs={prs} />
        </div>
      </div>

      {/* WHOOP Trends */}
      <div className="stack">
        <WhoopTrendSection from={from} to={to} refreshKey={whoopDataVersion} />
      </div>

      {/* Lift Split */}
      <div className="stack">
        <LiftSplitSection filtered={filtered} />
      </div>

      {/* Fitness/Fatigue/Form */}
      <div className="stack">
        <FitnessFatigueSection
          filtered={namedActivities.filter(a => selectedTypes.has(a.type))}
          today={today}
        />
      </div>

      {/* Run Efficiency + Day Pattern */}
      <div className="stack">
        <div className="grid-layout row-insights">
          <RunEfficiencySection filtered={filtered} />
          <WeekPatternSection filtered={filtered} />
        </div>
      </div>

      {/* Activity table */}
      <div className="stack">
        <ActivityTable filtered={filtered} onRename={rename} />
      </div>

      <ChatBot
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        activities={namedActivities}
        filtered={filtered}
        today={today}
        from={from}
        to={to}
        selectedTypes={selectedTypes}
        restDate={restDate}
      />

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onThemeChange={handleThemeChange}
        onSyncComplete={() => setWhoopDataVersion(v => v + 1)}
        period={period}
        onPeriod={setPeriod}
      />
    </div>
  );
}
