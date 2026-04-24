'use client';

import { useState } from 'react';

export function DriverInsight({
  driverId,
  quarter,
}: {
  driverId: string;
  quarter: string;
}) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setInsight(null);
    try {
      const res = await fetch('/api/analytics/moneyball/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, quarter }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Eroare la generare');
      } else {
        setInsight(data.insight);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare rețea');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            Insight generat de Claude
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Analiză în limbaj natural pe baza datelor de mai jos
          </p>
        </div>
        <button
          className={loading ? 'btn btn-outline' : 'btn btn-primary'}
          onClick={generate}
          disabled={loading}
          style={{ fontSize: 13, padding: '6px 14px' }}
        >
          {loading ? 'Se generează...' : insight ? 'Regenerează' : 'Generează'}
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

      {insight && (
        <div
          style={{
            fontSize: 14,
            color: 'var(--text)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {insight}
        </div>
      )}

      {!insight && !error && !loading && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Apasă „Generează" pentru o analiză a acestui șofer. Cost per apel: ~$0.01.
        </p>
      )}
    </div>
  );
}
