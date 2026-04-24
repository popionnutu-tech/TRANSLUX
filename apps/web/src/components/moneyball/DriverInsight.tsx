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
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-semibold text-slate-900">Insight generat de Claude</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Analiză în limbaj natural pe baza datelor de mai jos
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="px-3 py-1.5 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
        >
          {loading ? 'Se generează...' : insight ? 'Regenerează' : 'Generează'}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {insight && (
        <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
          {insight}
        </div>
      )}

      {!insight && !error && !loading && (
        <p className="text-sm text-slate-400 italic">
          Apasă „Generează" pentru o analiză a acestui șofer. Cost per apel: ~$0.01.
        </p>
      )}
    </div>
  );
}
