'use client';
import { useMemo } from 'react';
import type { Activity } from '@/lib/types';
import { recommendWorkout } from '@/lib/recommendation';
import Icon from './ui/Icon';

interface Props {
  activities: Activity[];
  selectedTypes: Set<string>;
  today: Date;
}

const STATUS_LABELS = {
  recover: 'Recover',
  maintain: 'Maintain',
  build: 'Build',
  push: 'Push',
};

export default function WorkoutSuggestionSection({ activities, selectedTypes, today }: Props) {
  const suggestion = useMemo(() => {
    return recommendWorkout(activities.filter(a => selectedTypes.has(a.type)), today);
  }, [activities, selectedTypes, today]);

  const iconName = suggestion.status === 'recover' ? 'heart' : suggestion.status === 'push' ? 'bolt' : 'chart';

  return (
    <>
      <div className={`card workout-card workout-card-desktop workout-${suggestion.status} fade-in`}>
        <div className="workout-main">
          <div className="workout-icon" aria-hidden="true">
            <Icon name={iconName} size={18} />
          </div>
          <div className="workout-copy">
            <div className="card-title">Today&apos;s Workout</div>
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
            <div className="card-title">Today&apos;s Workout</div>
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
      </div>
    </>
  );
}
