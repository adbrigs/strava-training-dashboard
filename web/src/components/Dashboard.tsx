'use client';
import { useEffect, useMemo, useState } from 'react';
import { parseActivities, computePRs, fmtDateTime, ACTIVITY_COLORS } from '@/lib/dataUtils';
import type { Activity, PR } from '@/lib/types';
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
import WorkoutSuggestionSection from './WorkoutSuggestionSection';
import ChatBot from './ChatBot';

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
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

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
  const [rangePreset, setRangePreset] = useState('60d');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedBucket, setSelectedBucket] = useState<{ start: Date; end: Date; label: string } | null>(null);

  // activities is already sorted desc by date from the load effect
  const today = useMemo(() => activities.length > 0 ? activities[0].date : new Date(), [activities]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_GITHUB_REFRESH_TOKEN;
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch(
      'https://api.github.com/repos/adbrigs/strava-training-dashboard/actions/workflows/schedule.yml/runs?status=success&per_page=1',
      { headers }
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
          const maxDate = parsed[0].date;
          const initFrom = new Date(maxDate);
          initFrom.setDate(initFrom.getDate() - 59);
          initFrom.setHours(0, 0, 0, 0);
          setFrom(initFrom);
          setTo(maxDate);
          const allTypes = [...new Set(parsed.map(a => a.type))];
          setSelectedTypes(new Set(allTypes));
        }
      } catch (err) {
        console.error('Failed to load activity data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleRefresh() {
    if (refreshStatus === 'loading') return;
    setRefreshStatus('loading');
    try {
      const token = process.env.NEXT_PUBLIC_GITHUB_REFRESH_TOKEN;
      const res = await fetch(
        'https://api.github.com/repos/adbrigs/strava-training-dashboard/actions/workflows/schedule.yml/dispatches',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: 'main' }),
        }
      );
      setRefreshStatus(res.status === 204 ? 'success' : 'error');
    } catch {
      setRefreshStatus('error');
    }
    setTimeout(() => setRefreshStatus('idle'), 3500);
  }

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
    setSelectedTypes(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
  }

  const presentTypes = useMemo(() => {
    const set = new Set(activities.map(a => a.type));
    return Object.keys(ACTIVITY_COLORS).filter(t => set.has(t)).concat(
      [...set].filter(t => !ACTIVITY_COLORS[t])
    );
  }, [activities]);

  const filtered = useMemo(() => {
    return activities.filter(a => a.date >= from && a.date <= to && selectedTypes.has(a.type));
  }, [activities, from, to, selectedTypes]);

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
          <div className="brand">A</div>
          <div className="hdr-title">
            <h1>Andrew&apos;s Training</h1>
            <small>
              <span className="dot" />
              Synced {fmtDateTime(lastSync ?? today)}
              <button
                className="refresh-btn"
                onClick={handleRefresh}
                disabled={refreshStatus === 'loading'}
                title={
                  refreshStatus === 'loading' ? 'Refreshing data…' :
                  refreshStatus === 'success' ? 'Refresh queued!' :
                  refreshStatus === 'error'   ? 'Failed — check GitHub token' :
                  'Refresh training data'
                }
              >
                <Icon
                  name="refresh"
                  size={12}
                  style={{
                    animation: refreshStatus === 'loading' ? 'spin 0.8s linear infinite' : undefined,
                    color: refreshStatus === 'success' ? 'var(--accent)' : refreshStatus === 'error' ? 'var(--hot)' : undefined,
                    transition: 'color 200ms',
                  }}
                />
              </button>
            </small>
          </div>
        </div>
        <div className="hdr-r">
          <button className="icon-btn" title="Toggle theme" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
          </button>
          <button
            className="chat-toggle"
            title="Coach AI"
            onClick={() => setIsChatOpen(o => !o)}
            data-active={isChatOpen ? 'true' : 'false'}
          >
            <Icon name="chat" size={14} />
          </button>
          <div className="avatar">AB</div>
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
        period={period}
        onPeriod={setPeriod}
      />

      {/* KPI metrics row */}
      <div className="stack">
        <SummaryRow filtered={filtered} today={today} />
      </div>

      {/* Daily training */}
      <div className="stack">
        <div className="grid-layout row-daily">
          <WorkoutSuggestionSection activities={activities} selectedTypes={selectedTypes} today={today} restDate={restDate} onRestDateChange={handleRestDateChange} />
          <TrainingCalendarSection activities={activities} selectedTypes={selectedTypes} today={today} />
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

      {/* Lift Split */}
      <div className="stack">
        <LiftSplitSection filtered={filtered} />
      </div>

      {/* Fitness/Fatigue/Form */}
      <div className="stack">
        <FitnessFatigueSection
          filtered={activities.filter(a => selectedTypes.has(a.type))}
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
        <ActivityTable filtered={filtered} />
      </div>

      <ChatBot
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        activities={activities}
        filtered={filtered}
        today={today}
        from={from}
        to={to}
        selectedTypes={selectedTypes}
        restDate={restDate}
      />
    </div>
  );
}
