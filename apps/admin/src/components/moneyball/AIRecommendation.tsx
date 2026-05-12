'use client';

import { useState } from 'react';

export function AIRecommendation({
  quarter,
  mode,
  crmRouteId,
  label,
  autoGenerate,
}: {
  quarter: string;
  mode: 'overall' | 'route';
  crmRouteId?: number;
  label?: string;
  autoGenerate?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setText(null);
    try {
      const res = await fetch('/api/analytics/moneyball/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter, mode, crmRouteId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Eroare la generare');
      } else {
        setText(data.recommendation);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare rețea');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        padding: 20,
        borderTop: '3px solid var(--primary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>
            {label ?? 'Recomandare AI'}
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {mode === 'overall'
              ? 'Analiză strategică pe toate rutele — top rotații + pattern-uri detectate'
              : 'Analiză pe rută: cine e cel mai bun vânzător și ce să faci'}
          </p>
        </div>
        <button
          className={loading ? 'btn btn-outline' : 'btn btn-primary'}
          onClick={generate}
          disabled={loading}
          style={{ fontSize: 13, padding: '6px 14px' }}
        >
          {loading ? 'Se analizează...' : text ? 'Regenerează' : 'Generează analiza'}
        </button>
      </div>

      {error && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--danger)',
            background: 'var(--danger-dim)',
            border: '1px solid rgba(185,28,28,0.15)',
            borderRadius: 'var(--radius-xs)',
            padding: '8px 12px',
          }}
        >
          {error}
        </div>
      )}

      {text && (
        <div
          style={{
            fontSize: 14,
            color: 'var(--text)',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </div>
      )}

      {!text && !error && !loading && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Apasă „Generează analiza" — Claude va studia datele și îți va spune exact ce rotații să
          faci. Cost: ~$0.02.
        </p>
      )}
    </div>
  );
}
