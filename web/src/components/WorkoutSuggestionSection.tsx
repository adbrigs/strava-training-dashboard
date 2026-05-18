'use client';
import { useMemo } from 'react';
import type { Activity } from '@/lib/types';
import { recommendWorkout } from '@/lib/recommendation';
import { dateKey } from '@/lib/dataUtils';
import Icon from './ui/Icon';

interface Props {
  activities: Activity[];
  selectedTypes: Set<string>;
  today: Date;
  restDate: string | null;
  onRestDateChange: (date: string | null) => void;
}

const STATUS_LABELS = {
  recover: 'Recover',
  maintain: 'Maintain',
  build: 'Build',
  push: 'Push',
};

function RestPlanner({
  restDate,
  onRestDateChange,
  defaultDate,
}: {
  restDate: string | null;
  onRestDateChange: (d: string | null) => void;
  defaultDate: string;
}) {
  const isChecked = restDate !== null;

  function handleCheck(e: React.ChangeEvent<HTMLInputElement>) {
    onRestDateChange(e.target.checked ? defaultDate : null);
  }

  return (
    <div className="workout-rest-planner">
      <label className="workout-rest-label">
        <input
          type="checkbox"
          className="workout-rest-check"
          checked={isChecked}
          onChange={handleCheck}
        />
        <span style={isChecked ? { color: 'var(--z2)' } : undefined}>Rest day</span>
      </label>
      {isChecked && (
        <input
          type="date"
          className="workout-rest-date"
          value={restDate ?? defaultDate}
          onChange={e => onRestDateChange(e.target.value || null)}
        />
      )}
    </div>
  );
}

export default function WorkoutSuggestionSection({ activities, selectedTypes, today, restDate, onRestDateChange }: Props) {
  const suggestion = useMemo(() => {
    return recommendWorkout(activities.filter(a => selectedTypes.has(a.type)), today, restDate);
  }, [activities, selectedTypes, today, restDate]);

  const iconName = suggestion.status === 'recover' ? 'heart' : suggestion.status === 'push' ? 'bolt' : 'chart';

  const todayKey = dateKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = dateKey(tomorrow);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  const isRestingToday = restDate === todayKey;
  const isRestingTomorrow = restDate === tomorrowKey;

  // Worked out today + rest tomorrow → show Monday (day after tomorrow)
  // Worked out today / resting today → show tomorrow
  // Otherwise → today
  const targetDay =
    suggestion.workedOutToday && isRestingTomorrow ? dayAfterTomorrow :
    suggestion.workedOutToday || isRestingToday    ? tomorrow :
    today;
  const cardTitle = targetDay === today
    ? "Today's Workout"
    : `${targetDay.toLocaleDateString(undefined, { weekday: 'long' })}'s Workout`;

  // Default the date picker to tomorrow if already worked out today, otherwise today
  const defaultRestDate = suggestion.workedOutToday ? tomorrowKey : todayKey;

  return (
    <>
      <div className={`card workout-card workout-card-desktop workout-${suggestion.status} fade-in`}>
        <div className="workout-main">
          <div className="workout-icon" aria-hidden="true">
            <Icon name={iconName} size={18} />
          </div>
          <div className="workout-copy">
            <div className="card-title">{cardTitle}</div>
            <h2>{suggestion.title}</h2>
            <div className="workout-prescription">
              <span>{suggestion.type}</span>
              <span>{suggestion.duration}</span>
              <span>{suggestion.intensity}</span>
            </div>
            <p>{suggestion.reason}</p>
            <div className="workout-alt">
              <span>Alternative</span>
              {suggestion.alternative}
            </div>
            <RestPlanner
              restDate={restDate}
              onRestDateChange={onRestDateChange}
              defaultDate={defaultRestDate}
            />
          </div>
        </div>

        <div className="workout-side">
          <div className={`workout-badge ${suggestion.status}`}>
            {STATUS_LABELS[suggestion.status]}
          </div>
          <div className="workout-confidence">{suggestion.confidence} confidence</div>
          <div className="workout-metrics">
            <div><span>Form</span><strong>{suggestion.metrics.form > 0 ? '+' : ''}{suggestion.metrics.form.toFixed(1)}</strong></div>
            <div><span>7d load</span><strong>{Math.round(suggestion.metrics.sevenDayTrimp)}</strong></div>
            <div><span>Baseline</span><strong>{Math.round(suggestion.metrics.weeklyBaseline)}</strong></div>
          </div>
        </div>
      </div>

      <div className={`card workout-mobile-card workout-${suggestion.status} fade-in`}>
        <div className="workout-mobile-head">
          <div className="workout-icon" aria-hidden="true">
            <Icon name={iconName} size={16} />
          </div>
          <div className="workout-mobile-title">
            <div className="card-title">{cardTitle}</div>
            <h2>{suggestion.title}</h2>
          </div>
          <div className={`workout-badge ${suggestion.status}`}>
            {STATUS_LABELS[suggestion.status]}
          </div>
        </div>
        <div className="workout-prescription">
          <span>{suggestion.type}</span>
          <span>{suggestion.duration}</span>
          <span>{suggestion.intensity}</span>
        </div>
        <p>{suggestion.reason}</p>
        <div className="workout-metrics">
          <div><span>Form</span><strong>{suggestion.metrics.form > 0 ? '+' : ''}{suggestion.metrics.form.toFixed(1)}</strong></div>
          <div><span>7d</span><strong>{Math.round(suggestion.metrics.sevenDayTrimp)}</strong></div>
          <div><span>Baseline</span><strong>{Math.round(suggestion.metrics.weeklyBaseline)}</strong></div>
        </div>
        <div className="workout-alt">
          <span>Alt</span>
          {suggestion.alternative}
        </div>
        <RestPlanner
          restDate={restDate}
          onRestDateChange={onRestDateChange}
          defaultDate={defaultRestDate}
        />
      </div>
    </>
  );
}
