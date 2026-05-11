'use client';

export type IconName =
  | 'search' | 'cal' | 'chev' | 'bell' | 'moon' | 'sun' | 'info'
  | 'arrowU' | 'arrowD' | 'arrowR' | 'settings' | 'bolt' | 'trophy'
  | 'heart' | 'flame' | 'weight' | 'chart' | 'grip' | 'x' | 'refresh';

const PATHS: Record<IconName, React.ReactNode> = {
  search:   <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  cal:      <><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9h17M8 3v3M16 3v3" /></>,
  chev:     <path d="m6 9 6 6 6-6" />,
  bell:     <><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7z"/><path d="M10 19a2 2 0 0 0 4 0" /></>,
  moon:     <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  sun:      <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>,
  info:     <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/></>,
  arrowU:   <path d="m6 14 6-6 6 6" />,
  arrowD:   <path d="m6 10 6 6 6-6" />,
  arrowR:   <path d="M5 12h14M13 6l6 6-6 6" />,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/></>,
  bolt:     <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  trophy:   <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v3a3 3 0 0 1-3 3M7 5H4v3a3 3 0 0 0 3 3"/></>,
  heart:    <path d="M12 20s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 5C19 15.5 12 20 12 20z"/>,
  flame:    <path d="M12 2c0 3 3 5 3 9a3 3 0 0 1-6 0c0-1 .5-2 1-3-2 1-4 3-4 6a6 6 0 0 0 12 0c0-6-6-7-6-12z"/>,
  weight:   <><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/></>,
  chart:    <path d="M3 21h18M7 17V9M12 17V5M17 17v-6"/>,
  grip:     <><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"></circle></>,
  x:        <path d="M6 6l12 12M18 6 6 18"/>,
  refresh:  <><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Icon({ name, size = 16, className, style }: Props) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
