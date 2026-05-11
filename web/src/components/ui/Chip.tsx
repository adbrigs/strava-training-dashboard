'use client';

interface Props {
  label: string;
  color: string;
  on: boolean;
  onClick: () => void;
}

export default function Chip({ label, color, on, onClick }: Props) {
  return (
    <button
      type="button"
      className={`chip ${on ? 'on' : ''}`}
      onClick={onClick}
      style={{ '--c': color } as React.CSSProperties}
    >
      <span className="swatch" />
      {label}
    </button>
  );
}
