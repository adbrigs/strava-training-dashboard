'use client';
import { useEffect, useState } from 'react';
import Icon from './ui/Icon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onThemeChange: (t: 'dark' | 'light') => void;
  onSyncComplete?: () => void;
  period: 'daily' | 'weekly' | 'monthly';
  onPeriod: (p: 'daily' | 'weekly' | 'monthly') => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
      color: 'var(--text-subtle)', fontWeight: 700, marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

export default function SettingsDrawer({ isOpen, onClose, theme, onThemeChange, period, onPeriod }: Props) {
  const [whoopConnected, setWhoopConnected] = useState<boolean | null>(null);
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/whoop/data')
      .then(r => r.json())
      .then(d => setWhoopConnected(d.connected))
      .catch(() => setWhoopConnected(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  function copyWebhookUrl() {
    const url = `${window.location.origin}/api/whoop/webhook`;
    navigator.clipboard.writeText(url).then(() => {
      setWebhookUrlCopied(true);
      setTimeout(() => setWebhookUrlCopied(false), 2000);
    });
  }

  async function syncWhoopData() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/whoop/backfill', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSyncResult({ ok: true });
      } else {
        setSyncResult({ ok: false, error: data.error ?? 'Sync failed' });
      }
    } catch {
      setSyncResult({ ok: false, error: 'Network error' });
    } finally {
      setSyncing(false);
    }
  }

  const btnBase: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    border: '1px solid var(--border)', cursor: 'pointer',
    background: 'var(--surface-3)', color: 'var(--text)',
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 200, opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'all' : 'none',
          transition: 'opacity 220ms',
        }}
      />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(380px, 100vw)',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 201,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 260ms cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px 16px',
          borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Settings</div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 36 }}>

          {/* ── Appearance ── */}
          <section>
            <SectionLabel>Appearance</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SettingRow label="Theme">
                <div className="seg">
                  <button className={theme === 'light' ? 'on' : ''} onClick={() => onThemeChange('light')}>
                    Light
                  </button>
                  <button className={theme === 'dark' ? 'on' : ''} onClick={() => onThemeChange('dark')}>
                    Dark
                  </button>
                </div>
              </SettingRow>
              <SettingRow label="Volume period">
                <div className="seg">
                  <button className={period === 'daily' ? 'on' : ''} onClick={() => onPeriod('daily')}>Daily</button>
                  <button className={period === 'weekly' ? 'on' : ''} onClick={() => onPeriod('weekly')}>Weekly</button>
                  <button className={period === 'monthly' ? 'on' : ''} onClick={() => onPeriod('monthly')}>Monthly</button>
                </div>
              </SettingRow>
            </div>
          </section>

          {/* ── WHOOP ── */}
          <section>
            <SectionLabel>WHOOP</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

              {/* Connection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 500 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                    background: whoopConnected === true ? 'var(--z2)' : whoopConnected === false ? 'var(--hot)' : 'var(--text-subtle)',
                  }} />
                  {whoopConnected === null ? 'Checking connection…' : whoopConnected ? 'Connected' : 'Not connected'}
                </div>
                <a
                  href="/api/whoop/auth"
                  style={{
                    display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
                    padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: 'var(--accent)', color: 'var(--accent-ink)', textDecoration: 'none',
                  }}
                >
                  {whoopConnected ? 'Reconnect WHOOP' : 'Connect WHOOP'}
                </a>
                {whoopConnected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      onClick={syncWhoopData}
                      disabled={syncing}
                      style={{
                        ...btnBase, alignSelf: 'flex-start',
                        opacity: syncing ? 0.6 : 1,
                        cursor: syncing ? 'default' : 'pointer',
                      }}
                    >
                      {syncing ? 'Syncing…' : 'Sync WHOOP Data'}
                    </button>
                    {syncResult && (
                      <span style={{
                        fontSize: 11, fontFamily: 'var(--font-mono)',
                        color: syncResult.ok ? 'var(--z2)' : 'var(--hot)',
                      }}>
                        {syncResult.ok ? '✓ Refresh started — updates in ~2 min' : `✗ ${syncResult.error}`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* Webhook */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Webhook</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Register this URL in the{' '}
                  <a href="https://developer.whoop.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                    WHOOP Developer Portal
                  </a>
                  {' '}under your app&apos;s webhook settings. WHOOP will then push new scores automatically.
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 12px',
                }}>
                  <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)', flex: 1, wordBreak: 'break-all' }}>
                    {typeof window !== 'undefined' ? `${window.location.origin}/api/whoop/webhook` : '/api/whoop/webhook'}
                  </code>
                  <button
                    onClick={copyWebhookUrl}
                    style={{ ...btnBase, padding: '4px 10px', fontSize: 11, flexShrink: 0 }}
                  >
                    {webhookUrlCopied ? '✓' : 'Copy'}
                  </button>
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* GitHub secret */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Auto-refresh Secret</div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>optional</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Only needed if you want the GitHub Actions workflow to refresh WHOOP data automatically. Skip this if you&apos;ll run backfills manually.
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  This mints an <strong>independent</strong> token just for the workflow, so rotating it never disconnects this dashboard. Paste it into <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 11 }}>WHOOP_REFRESH_TOKEN</span> at GitHub → Settings → Secrets → Actions.
                </div>
                <a
                  href="/api/whoop/auth?mode=cron"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    ...btnBase, alignSelf: 'flex-start', textDecoration: 'none',
                    background: 'var(--surface-3)', color: 'var(--text)',
                  }}
                >
                  Generate cron token
                </a>
              </div>

            </div>
          </section>

        </div>
      </div>
    </>
  );
}
