'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FbEvent, FbMessagingConfig } from '@translux/db';
import {
  updateSystemPrompt,
  setBotEnabled,
  setAutoReplyFlags,
  deleteFbConfig,
} from './actions';

type Props = {
  initialConfigs: FbMessagingConfig[];
  initialEvents: FbEvent[];
};

export default function FbBotClient({ initialConfigs, initialEvents }: Props) {
  const router = useRouter();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialConfigs[0]?.page_id ?? null,
  );
  const selected = initialConfigs.find(c => c.page_id === selectedPageId) || null;

  const [prompt, setPrompt] = useState(selected?.system_prompt ?? '');
  const [saveMsg, setSaveMsg] = useState<string>('');
  const [subscribeMsg, setSubscribeMsg] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  function onSelectPage(pageId: string) {
    const cfg = initialConfigs.find(c => c.page_id === pageId);
    setSelectedPageId(pageId);
    setPrompt(cfg?.system_prompt ?? '');
    setSaveMsg('');
    setSubscribeMsg('');
  }

  function savePrompt() {
    if (!selected) return;
    startTransition(async () => {
      try {
        await updateSystemPrompt(selected.page_id, prompt);
        setSaveMsg('Salvat ✓');
        setTimeout(() => setSaveMsg(''), 2000);
      } catch (err) {
        setSaveMsg(`Eroare: ${(err as Error).message}`);
      }
    });
  }

  function toggleEnabled(next: boolean) {
    if (!selected) return;
    startTransition(async () => {
      await setBotEnabled(selected.page_id, next);
      router.refresh();
    });
  }

  function toggleAutoReply(key: 'auto_reply_dm' | 'auto_reply_comments', next: boolean) {
    if (!selected) return;
    startTransition(async () => {
      await setAutoReplyFlags(selected.page_id, { [key]: next });
      router.refresh();
    });
  }

  async function subscribeWebhooks() {
    if (!selected) return;
    setSubscribeMsg('...');
    try {
      const res = await fetch('/api/fb-bot/subscribe-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: selected.page_id }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubscribeMsg('Abonat cu succes ✓');
      } else {
        setSubscribeMsg(`Eroare: ${data.error || 'unknown'}`);
      }
    } catch (err) {
      setSubscribeMsg(`Eroare: ${(err as Error).message}`);
    }
  }

  async function removeConfig() {
    if (!selected) return;
    if (!confirm(`Ștergi configurația pentru "${selected.page_name}"?`)) return;
    startTransition(async () => {
      await deleteFbConfig(selected.page_id);
      router.refresh();
    });
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, fontFamily: 'var(--font-opensans), sans-serif' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Facebook auto-reply bot</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Răspunsuri automate generate de Claude Sonnet 4.6 pentru mesaje Messenger și comentarii sub postări.
      </p>

      {initialConfigs.length === 0 ? (
        <div
          style={{
            padding: 24,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#f8fafc',
            marginBottom: 24,
          }}
        >
          <p style={{ marginBottom: 12 }}>
            Nicio pagină Facebook conectată. Autentifică-te cu Facebook pentru a continua.
          </p>
          <a
            href="/api/fb-bot/auth-start"
            style={{
              display: 'inline-block',
              background: '#1877f2',
              color: 'white',
              padding: '10px 18px',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Conectează Facebook
          </a>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600 }}>Pagina:</label>
            <select
              value={selectedPageId ?? ''}
              onChange={e => onSelectPage(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, minWidth: 240 }}
            >
              {initialConfigs.map(c => (
                <option key={c.page_id} value={c.page_id}>
                  {c.page_name} ({c.page_id})
                </option>
              ))}
            </select>
            <a
              href="/api/fb-bot/auth-start"
              style={{ fontSize: 13, color: '#2563eb', textDecoration: 'underline' }}
            >
              Reconectează Facebook
            </a>
          </div>

          {selected && (
            <div style={{ display: 'grid', gap: 24 }}>
              <section style={sectionStyle}>
                <h2 style={h2Style}>Status</h2>
                <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                  <div>
                    <strong>Enabled:</strong>{' '}
                    <button
                      disabled={isPending}
                      onClick={() => toggleEnabled(!selected.enabled)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 4,
                        border: 'none',
                        background: selected.enabled ? '#22c55e' : '#ef4444',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {selected.enabled ? 'ON — Oprește' : 'OFF — Pornește'}
                    </button>
                  </div>
                  <div>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.auto_reply_dm}
                        disabled={isPending}
                        onChange={e => toggleAutoReply('auto_reply_dm', e.target.checked)}
                      />{' '}
                      Auto-reply Messenger DM
                    </label>
                  </div>
                  <div>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.auto_reply_comments}
                        disabled={isPending}
                        onChange={e => toggleAutoReply('auto_reply_comments', e.target.checked)}
                      />{' '}
                      Auto-reply comentarii sub postări
                    </label>
                  </div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>
                    Token valid până: {selected.token_expires_at ? new Date(selected.token_expires_at).toLocaleString('ro-RO') : '—'}
                  </div>
                </div>
              </section>

              <section style={sectionStyle}>
                <h2 style={h2Style}>Webhook Facebook</h2>
                <p style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
                  Abonează pagina la evenimentele webhook (messages, comentarii) prin Graph API.
                </p>
                <button
                  onClick={subscribeWebhooks}
                  style={{
                    padding: '8px 16px',
                    background: '#1877f2',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Abonează webhook
                </button>
                {subscribeMsg && (
                  <span style={{ marginLeft: 12, fontSize: 13, color: subscribeMsg.startsWith('Eroare') ? '#ef4444' : '#16a34a' }}>
                    {subscribeMsg}
                  </span>
                )}
              </section>

              <section style={sectionStyle}>
                <h2 style={h2Style}>System prompt</h2>
                <p style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
                  Instrucțiunile pentru Claude. Include reguli, ton, limite.
                </p>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={14}
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontFamily: 'monospace',
                    fontSize: 13,
                    resize: 'vertical',
                  }}
                />
                <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button
                    onClick={savePrompt}
                    disabled={isPending}
                    style={{
                      padding: '8px 18px',
                      background: '#0f172a',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Salvează
                  </button>
                  {saveMsg && (
                    <span style={{ fontSize: 13, color: saveMsg.startsWith('Eroare') ? '#ef4444' : '#16a34a' }}>
                      {saveMsg}
                    </span>
                  )}
                </div>
              </section>

              <section style={sectionStyle}>
                <h2 style={h2Style}>Ultimele evenimente (50)</h2>
                {initialEvents.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: 13 }}>Niciun eveniment primit încă.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                          <th style={thStyle}>Data</th>
                          <th style={thStyle}>Tip</th>
                          <th style={thStyle}>Status</th>
                          <th style={thStyle}>Răspuns / eroare</th>
                        </tr>
                      </thead>
                      <tbody>
                        {initialEvents.map(ev => (
                          <tr key={ev.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={tdStyle}>{new Date(ev.created_at).toLocaleString('ro-RO')}</td>
                            <td style={tdStyle}>{ev.event_type}</td>
                            <td style={tdStyle}>
                              {ev.error ? (
                                <span style={{ color: '#ef4444' }}>ERR</span>
                              ) : ev.processed_at ? (
                                <span style={{ color: '#16a34a' }}>OK</span>
                              ) : (
                                <span style={{ color: '#eab308' }}>…</span>
                              )}
                            </td>
                            <td style={{ ...tdStyle, maxWidth: 480, whiteSpace: 'pre-wrap' }}>
                              {ev.error || ev.reply_text || ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <div>
                <button
                  onClick={removeConfig}
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    color: '#ef4444',
                    border: '1px solid #ef4444',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Șterge configurația paginii
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: 20,
  background: 'white',
};

const h2Style: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 12,
};

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #e2e8f0',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  verticalAlign: 'top',
};
