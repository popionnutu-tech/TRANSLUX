'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSuburbanSchedule, saveSuburbanCycle, loadSuburbanEntries, type SuburbanSchedule, type TariffConfig } from './actions';

interface Props {
  sessionId: string;
  crmRouteId: number;
  date: string;
  tariff: TariffConfig;
  canSeeSums: boolean;
  onSaved: () => void;
}

type CycleInputs = Record<number, { total: number; alighted: number }>; // key=stopOrder
type AllInputs = Record<number, CycleInputs>; // key=scheduleId

export default function SuburbanCountingForm({ sessionId, crmRouteId, date, tariff, canSeeSums, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [tur, setTur] = useState<SuburbanSchedule[]>([]);
  const [retur, setRetur] = useState<SuburbanSchedule[]>([]);
  const [inputs, setInputs] = useState<AllInputs>({});
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [saveMsg, setSaveMsg] = useState<Record<number, string>>({});

  useEffect(() => {
    (async () => {
      const { tur, retur } = await getSuburbanSchedule(crmRouteId, date);
      setTur(tur);
      setRetur(retur);
      const existing = await loadSuburbanEntries(sessionId);
      const map: AllInputs = {};
      const saved = new Set<number>();
      for (const e of existing) {
        if (!e.scheduleId) continue;
        if (!map[e.scheduleId]) map[e.scheduleId] = {};
        map[e.scheduleId][e.stopOrder] = { total: e.totalPassengers, alighted: e.alighted };
        saved.add(e.scheduleId);
      }
      setInputs(map);
      setSavedIds(saved);
      setLoading(false);
    })();
  }, [sessionId, crmRouteId, date]);

  const setInput = useCallback((scheduleId: number, stopOrder: number, key: 'total' | 'alighted', value: number) => {
    setInputs(prev => ({
      ...prev,
      [scheduleId]: {
        ...(prev[scheduleId] || {}),
        [stopOrder]: {
          ...(prev[scheduleId]?.[stopOrder] || { total: 0, alighted: 0 }),
          [key]: value,
        },
      },
    }));
  }, []);

  function cycleTotal(sched: SuburbanSchedule): number {
    const briceniKm = sched.stops[sched.stops.length - 1]?.kmFromStart ?? 0;
    const cycle = inputs[sched.scheduleId] || {};
    let total = 0;
    for (const s of sched.stops) {
      const dist = Math.abs(briceniKm - s.kmFromStart);
      if (dist === 0) continue;
      const tur = cycle[s.stopOrder]?.total ?? 0;
      const ret = cycle[s.stopOrder]?.alighted ?? 0;
      total += (tur + ret) * dist * tariff.ratePerKmSuburban;
    }
    return Math.round(total);
  }

  async function save(sched: SuburbanSchedule) {
    const entries = sched.stops.map(s => ({
      stopOrder: s.stopOrder,
      stopNameRo: s.nameRo,
      kmFromStart: s.kmFromStart,
      totalPassengers: inputs[sched.scheduleId]?.[s.stopOrder]?.total ?? 0,
      alighted: inputs[sched.scheduleId]?.[s.stopOrder]?.alighted ?? 0,
    }));
    const total = cycleTotal(sched);
    const { error } = await saveSuburbanCycle(sessionId, sched.scheduleId, sched.direction, sched.sequenceNo, entries, total);
    if (error) {
      setSaveMsg(prev => ({ ...prev, [sched.scheduleId]: 'Eroare: ' + error }));
      return;
    }
    setSavedIds(prev => new Set(prev).add(sched.scheduleId));
    setSaveMsg(prev => ({ ...prev, [sched.scheduleId]: 'Salvat ✓' }));
    setTimeout(() => setSaveMsg(prev => { const n = { ...prev }; delete n[sched.scheduleId]; return n; }), 2000);
    onSaved();
  }

  // Enter/Space avansează la următorul input:
  // întâi toate TUR ale ciclului, apoi toate RETUR, apoi următorul ciclu.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const cur = e.currentTarget;
    const cycleId = Number(cur.dataset.cycleId);
    const dir = cur.dataset.dir as 'tur' | 'retur';
    const stopOrder = Number(cur.dataset.stopOrder);

    const allCycles = [...tur, ...retur];
    const cycleIdx = allCycles.findIndex(c => c.scheduleId === cycleId);
    if (cycleIdx < 0) return;
    const curCycle = allCycles[cycleIdx];
    const stops = [...curCycle.stops].sort((a, b) => a.stopOrder - b.stopOrder);
    const stopIdx = stops.findIndex(s => s.stopOrder === stopOrder);

    let nextKey: string | null = null;
    if (dir === 'tur') {
      if (stopIdx < stops.length - 1) {
        nextKey = `${cycleId}-tur-${stops[stopIdx + 1].stopOrder}`;
      } else {
        nextKey = `${cycleId}-retur-${stops[0].stopOrder}`;
      }
    } else {
      if (stopIdx < stops.length - 1) {
        nextKey = `${cycleId}-retur-${stops[stopIdx + 1].stopOrder}`;
      } else if (cycleIdx < allCycles.length - 1) {
        const next = allCycles[cycleIdx + 1];
        const nextStops = [...next.stops].sort((a, b) => a.stopOrder - b.stopOrder);
        nextKey = `${next.scheduleId}-tur-${nextStops[0].stopOrder}`;
      }
    }

    if (nextKey) {
      const el = document.querySelector<HTMLInputElement>(`input[data-key="${nextKey}"]`);
      if (el) {
        el.focus();
        el.select();
      }
    }
  }

  if (loading) return <p className="text-muted">Se încarcă orarul…</p>;

  const renderCycle = (sched: SuburbanSchedule, headerColor: string) => {
    const done = savedIds.has(sched.scheduleId);
    const start = sched.stops[0];
    const end = sched.stops[sched.stops.length - 1];
    const total = canSeeSums ? cycleTotal(sched) : 0;
    const msg = saveMsg[sched.scheduleId];
    return (
      <div
        key={sched.scheduleId}
        className="card"
        style={{
          padding: 10,
          marginBottom: 10,
          borderLeft: `4px solid ${done ? 'var(--success, #0a7)' : headerColor}`,
          background: done ? 'rgba(0,170,90,0.04)' : undefined,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <strong style={{ color: headerColor }}>
            {sched.direction.toUpperCase()} — Cursa {sched.sequenceNo}
          </strong>
          <span style={{ fontSize: 13, color: '#555' }}>
            {start?.stopTime} {start?.nameRo} → {end?.nameRo} {end?.stopTime}
            {done && <span style={{ marginLeft: 8, color: 'var(--success, #0a7)' }}>✓ salvat</span>}
          </span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {canSeeSums && <strong>{total} lei</strong>}
            <button className="btn btn-primary btn-sm" onClick={() => save(sched)}>Salvează</button>
            {msg && <span style={{ fontSize: 12 }}>{msg}</span>}
          </div>
        </div>
        <table className="table" style={{ fontSize: 13, margin: 0 }}>
          <thead>
            <tr>
              <th>Stație</th>
              <th>Oră</th>
              <th>Km</th>
              <th title="Pasageri urcați din sat spre Briceni">TUR</th>
              <th title="Pasageri coborâți din Briceni spre sat">RETUR</th>
            </tr>
          </thead>
          <tbody>
            {sched.stops.map(s => (
              <tr key={s.stopId}>
                <td><strong>{s.nameRo}</strong></td>
                <td>{s.stopTime}</td>
                <td>{s.kmFromStart}</td>
                <td>
                  <input
                    data-key={`${sched.scheduleId}-tur-${s.stopOrder}`}
                    data-cycle-id={sched.scheduleId}
                    data-dir="tur"
                    data-stop-order={s.stopOrder}
                    type="number"
                    min={0}
                    value={inputs[sched.scheduleId]?.[s.stopOrder]?.total ?? ''}
                    onChange={e => setInput(sched.scheduleId, s.stopOrder, 'total', parseInt(e.target.value) || 0)}
                    onKeyDown={handleKeyDown}
                    onFocus={e => e.target.select()}
                    style={{ width: 70 }}
                  />
                </td>
                <td>
                  <input
                    data-key={`${sched.scheduleId}-retur-${s.stopOrder}`}
                    data-cycle-id={sched.scheduleId}
                    data-dir="retur"
                    data-stop-order={s.stopOrder}
                    type="number"
                    min={0}
                    value={inputs[sched.scheduleId]?.[s.stopOrder]?.alighted ?? ''}
                    onChange={e => setInput(sched.scheduleId, s.stopOrder, 'alighted', parseInt(e.target.value) || 0)}
                    onKeyDown={handleKeyDown}
                    onFocus={e => e.target.select()}
                    style={{ width: 70 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const grandTotal = canSeeSums ? [...tur, ...retur].reduce((s, sch) => s + cycleTotal(sch), 0) : 0;

  return (
    <div>
      {canSeeSums && (
        <div className="card" style={{ padding: 10, marginBottom: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div><span className="text-muted">Total zi:</span> <strong>{grandTotal} lei</strong></div>
          <div><span className="text-muted">Rata:</span> <strong>{tariff.ratePerKmSuburban} lei/km</strong></div>
          <div><span className="text-muted">Curse:</span> <strong>{tur.length + retur.length}</strong> ({savedIds.size} salvate)</div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>Enter/Space = următorul câmp</div>
        </div>
      )}

      {tur.length > 0 && (
        <>
          <h3 style={{ color: 'var(--primary, #9b1b30)', marginBottom: 6 }}>TUR ({tur.length})</h3>
          {tur.map(s => renderCycle(s, 'var(--primary, #9b1b30)'))}
        </>
      )}

      {retur.length > 0 && (
        <>
          <h3 style={{ color: '#1b6e9b', marginBottom: 6, marginTop: 12 }}>RETUR ({retur.length})</h3>
          {retur.map(s => renderCycle(s, '#1b6e9b'))}
        </>
      )}

      {tur.length === 0 && retur.length === 0 && (
        <p className="text-muted">Nu sunt curse pentru ziua selectată.</p>
      )}
    </div>
  );
}
