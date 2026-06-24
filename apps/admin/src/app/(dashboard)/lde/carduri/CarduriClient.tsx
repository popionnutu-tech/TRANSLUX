'use client';

import { useState, useTransition } from 'react';
import {
  getCardSuggestions,
  type CardSuggestionsResult,
} from './actions';

const fmtL = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('ro-MD')} L`);
const fmtLei = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('ro-MD')} lei`);

export default function CarduriClient({ initial }: { initial: CardSuggestionsResult }) {
  const [data, setData] = useState<CardSuggestionsResult>(initial);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  // Draft-urile parametrilor (editabile); recalculul se face la «Recalculează».
  const [plannedKm, setPlannedKm] = useState(String(initial.params.plannedKmDefault));
  const [reservePct, setReservePct] = useState(String(initial.params.reservePct));
  const [fuelPrice, setFuelPrice] = useState(String(initial.params.fuelPriceLei));

  function recalc() {
    setError('');
    const km = Number(plannedKm);
    const pct = Number(reservePct);
    const price = Number(fuelPrice);
    if (!Number.isFinite(km) || km <= 0) return setError('Km plan implicit trebuie să fie un număr pozitiv.');
    if (!Number.isFinite(pct) || pct < 0) return setError('Rezerva % trebuie să fie un număr ≥ 0.');
    if (!Number.isFinite(price) || price <= 0) return setError('Prețul motorinei trebuie să fie un număr pozitiv.');

    startTransition(async () => {
      try {
        const res = await getCardSuggestions(km, pct, price);
        setData(res);
      } catch (err: any) {
        setError(err?.message || 'Eroare la calcul');
      }
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Completare carduri — sugestii</h1>
      </div>

      {/* Banner explicativ */}
      <div
        className="card mb-4"
        style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a' }}
      >
        <strong>Sugestii de completare carduri.</strong> Sumele de mai jos sunt
        calculate din km planificați și norma efectivă a fiecărei mașini.
        Postarea pe portalul cardurilor se face <strong>manual</strong>, până la
        integrarea automată a portalului.
      </div>

      {/* Parametri editabili */}
      <div
        className="card mb-4"
        style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}
      >
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Km plan implicit</label>
          <input
            type="number"
            min="1"
            step="1"
            value={plannedKm}
            onChange={e => setPlannedKm(e.target.value)}
            style={{ width: 140 }}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Rezervă (%)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={reservePct}
            onChange={e => setReservePct(e.target.value)}
            style={{ width: 120 }}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Preț motorină (lei/L)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={fuelPrice}
            onChange={e => setFuelPrice(e.target.value)}
            style={{ width: 140 }}
          />
        </div>
        <button className="btn btn-primary" disabled={isPending} onClick={recalc}>
          {isPending ? 'Se calculează…' : 'Recalculează'}
        </button>
        <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>
          {data.rows.length} mașini cu normă
        </div>
      </div>

      {error && (
        <div className="card mb-4" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <span style={{ color: '#dc2626' }}>{error}</span>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Mașină</th>
              <th>Tip</th>
              <th>Normă efectivă</th>
              <th>Km plan</th>
              <th>Litri (normă)</th>
              <th>Litri + rezervă</th>
              <th>Sumă sugerată</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.plate}>
                <td style={{ fontWeight: 600 }}>{r.plate}</td>
                <td>{r.type ?? '—'}</td>
                <td>{r.norm} l/100km</td>
                <td>{r.plannedKm.toLocaleString('ro-MD')} km</td>
                <td>{fmtL(r.liters)}</td>
                <td style={{ fontWeight: 600 }}>{fmtL(r.litersWithReserve)}</td>
                <td style={{ fontWeight: 600 }}>{fmtLei(r.lei)}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted">
                  Nicio mașină cu normă efectivă. Atribuie tipuri în pagina «Mașini LDE».
                </td>
              </tr>
            )}
          </tbody>
          {data.rows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border, #e5e7eb)' }}>
                <td colSpan={5} className="text-right">Total</td>
                <td>{fmtL(data.totals.litersWithReserve)}</td>
                <td>{fmtLei(data.totals.lei)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
