'use client';

interface Props {
  values: number[];
  height?: number;
  stroke?: string;
  fill?: string;
  showDot?: boolean;
}

export default function Sparkline({ values, height = 28, stroke = 'currentColor', fill = 'none', showDot = true }: Props) {
  if (!values || values.length < 2) return <svg width="100%" height={height} />;
  const W = 100, H = height;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - ((v - min) / range) * (H - 4) - 2,
  ]);
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
  const dFill = d + ` L${W} ${H} L0 ${H} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={height}>
      {fill !== 'none' && <path d={dFill} fill={fill} opacity="0.18" />}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {showDot && <circle cx={last[0]} cy={last[1]} r="1.8" fill={stroke} />}
    </svg>
  );
}
