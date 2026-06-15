'use client';
import { useEffect, useState } from 'react';
import Icon from './ui/Icon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onThemeChange: (t: 'dark' | 'light') => void;
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

export default function SettingsDrawer({ isOpen, onClose, theme, onThemeChange }: Props) {
  const [whoopConnected, setWhoopConnected] = useState<boolean | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<'unknown' | 'registered' | 'unregistered'>('unknown');
  const [registering, setRegistering] = useState(false);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/whoop/data')
      .then(r => r.json())
      .then(d => setWhoopConnected(d.connected))
      .catch(() => setWhoopConnected(false));

    fetch('/api/whoop/register-webhook')
      .then(r => r.json())
      .then(d => setWebhookStatus(d.registered ? 'registered' : 'unregistered'))
      .catch(() => setWebhookStatus('unregistered'));

    fetch('/api/whoop/get-refresh-token')
      .then(r => r.json())
      .then(d => { if (d.refreshToken) setRefreshToken(d.refreshToken); })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  async function registerWebhook() {
    setRegistering(true);
    try {
      const res = await fetch('/api/whoop/register-webhook', { method: 'PUT' });
      const d = await res.json();
      setWebhookStatus(d.ok ? 'registered' : 'unregistered');
    } catch { /* ignore */ } finally { setRegistering(false); }
  }

  async function runBackfill() {
    setBackfilling(true);
    setBackfillMsg(null);
    try {
      const res = await fetch('/api/whoop/backfill', { method: 'POST' });
      const d = await res.json();
      if (d.ok) {
        const db = d.debug ?? {};
        setBackfillMsg(
          `✓ ${d.count} days — ` +
          `recovery: ${db.recovery?.scored ?? '?'}, ` +
          `sleep: ${db.sleep?.scored ?? '?'}, ` +
          `strain: ${db.cycle?.scored ?? '?'}`
        );
      } else {
        setBackfillMsg(`Error: ${d.error}`);
      }
    } catch (e) {
      setBackfillMsg(`Error: ${String(e)}`);
    } finally { setBackfilling(false); }
  }

  function copyToken() {
    if (!refreshToken) return;
    navigator.clipboard.writeText(refreshToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
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
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* Backfill */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Load History</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Fetches your full WHOOP history and saves it to the data file.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                  <button onClick={runBackfill} disabled={backfilling} style={{ ...btnBase, opacity: backfilling ? 0.6 : 1, cursor: backfilling ? 'default' : 'pointer' }}>
                    {backfilling ? 'Fetching…' : 'Run Backfill'}
                  </button>
                  {backfillMsg && (
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: backfillMsg.startsWith('✓') ? 'var(--z2)' : 'var(--hot)' }}>
                      {backfillMsg}
                    </span>
                  )}
                </div>
                {backfillMsg?.startsWith('✓') && (
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    Commit <code>web/public/data/whoop_history.json</code> to deploy.
                  </div>
                )}
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* Webhook */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
                  Webhook
                  <span style={{
                    fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 4,
                    color: webhookStatus === 'registered' ? 'var(--z2)' : 'var(--text-subtle)',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                    {webhookStatus === 'registered' ? 'live' : webhookStatus === 'unknown' ? '…' : 'not registered'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  WHOOP pushes new recovery, sleep, and strain scores automatically.
                </div>
                {webhookStatus !== 'registered' && (
                  <button
                    onClick={registerWebhook} disabled={registering}
                    style={{ ...btnBase, alignSelf: 'flex-start', opacity: registering ? 0.6 : 1, cursor: registering ? 'default' : 'pointer' }}
                  >
                    {registering ? 'Registering…' : 'Register Webhook'}
                  </button>
                )}
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* GitHub secret */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Auto-refresh Secret</div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>optional</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Only needed if you want the nightly GitHub Actions workflow to refresh WHOOP data automatically. Skip this if you&apos;ll run backfills manually.
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Add <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 11 }}>WHOOP_REFRESH_TOKEN</span> to GitHub → Settings → Secrets → Actions.
                </div>
                {refreshToken ? (
                  <button
                    onClick={copyToken}
                    style={{
                      ...btnBase, alignSelf: 'flex-start', fontFamily: 'var(--font-mono)', fontSize: 11,
                      background: copied ? 'var(--z2)' : 'var(--surface-3)',
                      color: copied ? 'var(--accent-ink)' : 'var(--text)',
                    }}
                  >
                    {copied ? '✓ Copied' : 'Copy refresh token'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                    {whoopConnected === false ? 'Connect WHOOP first' : 'loading…'}
                  </span>
                )}
              </div>

            </div>
          </section>

        </div>
      </div>
    </>
  );
}
