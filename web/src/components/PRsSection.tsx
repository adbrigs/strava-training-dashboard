'use client';
import type { PR } from '@/lib/types';
import { fmtDate } from '@/lib/dataUtils';
import Icon from './ui/Icon';

interface Props {
  prs: PR[];
}

export default function PRsSection({ prs }: Props) {
  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">Recent PRs & Milestones</div>
      </div>
      <div className="pr-list">
        {prs.map((p, i) => (
          <div key={i} className="pr-row" style={{ '--c': p.color } as React.CSSProperties}>
            <div className={`pr-icon ${p.fresh ? 'new' : ''}`}>
              <Icon name={p.iconKey} size={15} />
            </div>
            <div className="pr-meta">
              <div className="name">{p.name}</div>
              <div className="sub">{fmtDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
            <div className="pr-val">
              <div className="v">{p.value}</div>
              <div className={`d ${p.delta.startsWith('+') || p.delta.startsWith('−') ? 'up' : ''}`}>{p.delta}</div>
            </div>
          </div>
        ))}
        {prs.length === 0 && (
          <p style={{ color: 'var(--text-subtle)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
            No PR data available.
          </p>
        )}
      </div>
    </div>
  );
}
