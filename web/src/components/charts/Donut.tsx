'use client';

interface Slice {
  name: string;
  value: number;
  color: string;
}

interface Props {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}

export default function Donut({ slices, size = 160, thickness = 22, centerLabel, centerValue }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - thickness / 2 - 1;
  const cx = size / 2, cy = size / 2;
  let cum = -Math.PI / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
      {slices.map((s, i) => {
        const frac = s.value / total;
        const a0 = cum;
        const a1 = cum + frac * Math.PI * 2;
        cum = a1;
        const gap = 0.02;
        const start = a0 + gap / 2, end = a1 - gap / 2;
        if (end - start <= 0.001) return null;
        const x0 = cx + Math.cos(start) * r, y0 = cy + Math.sin(start) * r;
        const x1 = cx + Math.cos(end) * r, y1 = cy + Math.sin(end) * r;
        const large = end - start > Math.PI ? 1 : 0;
        const d = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
        return <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={thickness} strokeLinecap="butt" />;
      })}
      <g className="donut-center">
        <text className="v" x={cx} y={cy - 2} textAnchor="middle">{centerValue}</text>
        <text className="l" x={cx} y={cy + 14} textAnchor="middle">{centerLabel}</text>
      </g>
    </svg>
  );
}
