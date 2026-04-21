'use client';

import { useState, useEffect } from 'react';
import { getSuburbanSchedule, saveSuburbanCycle, loadSuburbanEntries, type SuburbanSchedule, type TariffConfig } from './actions';
import { calculateSuburban, type StopEntry } from './calculation';

interface Props {
  sessionId: string;
  crmRouteId: number;
  date: string;
  tariff: TariffConfig;
  canSeeSums: boolean;
  onSaved: () => void;
}

type CycleEntryInput = Record<number, { total: number; alighted: number }>;

export default function SuburbanCountingForm({ sessionId, crmRouteId, date, tariff, canSeeSums, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [tur, setTur] = useState<SuburbanSchedule[]>([]);
  const [retur, setRetur] = useState<SuburbanSchedule[]>([]);
  const [selected, setSelected] = useState<SuburbanSchedule | null>(null);
  const [inputs, setInputs] = useState<CycleEntryInput>({});
  const [savedMap, setSavedMap] = useState<Record<number, CycleEntryInput>>({});
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { tur, retur } = await getSuburbanSchedule(crmRouteId, date);
      setTur(tur);
      setRetur(retur);
      const existing = await loadSuburbanEntries(sessionId);
      const map: Record<number, CycleEntryInput> = {};
      for (const e of existing) {
        if (!e.scheduleId) continue;
        if (!map[e.scheduleId]) map[e.scheduleId] = {};
        map[e.scheduleId][e.stopOrder] = { total: e.totalPassengers, alighted: e.alighted };
      }
      setSavedMap(map);
      setLoading(false);
    })();
  }, [sessionId, crmRouteId, date]);

  function openCycle(sched: SuburbanSchedule) {
    setSelected(sched);
    setInputs(savedMap[sched.scheduleId] || {});
    setSaveMsg('');
  }

  function setInput(stopOrder: number, key: 'total' | 'alighted', value: number) {
    setInputs(prev => ({ ...prev, [stopOrder]: { ...(prev[stopOrder] || { total: 0, alighted: 0 }), [key]: value } }));
  }

  function currentTotal(): number {
    if (!selected) return 0;
    const stopEntries: StopEntry[] = selected.stops.map(s => ({
      stopOrder: s.stopOrder,
      stopNameRo: s.nameRo,
      kmFromStart: s.kmFromStart,
      totalPassengers: inputs[s.stopOrder]?.total ?? 0,
      alighted: inputs[s.stopOrder]?.alighted ?? 0,
      shortPassengers: [],
    }));
    const r = calculateSuburban(stopEntries, tariff.ratePerKmSuburban);
    return Math.round(r.total);
  }

  async function save() {
    if (!selected) return;
    const entries = selected.stops.map(s => ({
      stopOrder: s.stopOrder,
      stopNameRo: s.nameRo,
      kmFromStart: s.kmFromStart,
      totalPassengers: inputs[s.stopOrder]?.total ?? 0,
      alighted: inputs[s.stopOrder]?.alighted ?? 0,
    }));
    const total = currentTotal();
    const { error } = await saveSuburbanCycle(sessionId, selected.scheduleId, selected.direction, selected.sequenceNo, entries, total);
    if (error) {
      setSaveMsg('Eroare: ' + error);
      return;
    }
    setSaveMsg('Salvat ✓');
    setSavedMap(prev => ({ ...prev, [selected.scheduleId]: { ...inputs } }));
    onSaved();
  }

  if (loading) return <p className="text-muted">Se încarcă orarul…</p>;

  const renderCycleList = (items: SuburbanSchedule[], label: string) => (
    <div style={{ flex: 1, minWidth: 280 }}>
      <h3>{label}</h3>
      {items.length === 0 && <p className="text-muted">Nu sunt curse pentru ziua selectată.</p>}
      {items.map(s => {
        const done = savedMap[s.scheduleId] && Object.keys(savedMap[s.scheduleId]).length > 0;
        const start = s.stops[0];
        const end = s.stops[s.stops.length - 1];
        return (
          <button
            key={s.scheduleId}
            onClick={() => openCycle(s)}
            className="btn btn-outline"
            style={{
              display: 'block', width: '100%', marginBottom: 6, textAlign: 'left',
              borderColor: selected?.scheduleId === s.scheduleId ? 'var(--primary)' : undefined,
              background: done ? 'rgba(0,170,0,0.05)' : undefined,
            }}
          >
            <strong>Cursa {s.sequenceNo}</strong> — {start?.stopTime || '?'} {start?.nameRo} → {end?.nameRo} {end?.stopTime || ''}
            {done && ' ✓'}
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
        {renderCycleList(tur, 'TUR')}
        {renderCycleList(retur, 'RETUR')}
      </div>

      {selected && (
        <div className="card" style={{ padding: 14 }}>
          <h3>
            {selected.direction.toUpperCase()} — Cursa {selected.sequenceNo}
          </h3>
          <table className="table" style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Stație</th>
                <th>Oră</th>
                <th>Km</th>
                <th>Pasageri</th>
                <th>Coborât</th>
              </tr>
            </thead>
            <tbody>
              {selected.stops.map(s => (
                <tr key={s.stopId}>
                  <td>{s.stopOrder}</td>
                  <td><strong>{s.nameRo}</strong></td>
                  <td>{s.stopTime}</td>
                  <td>{s.kmFromStart}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={inputs[s.stopOrder]?.total ?? ''}
                      onChange={e => setInput(s.stopOrder, 'total', parseInt(e.target.value) || 0)}
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={inputs[s.stopOrder]?.alighted ?? ''}
                      onChange={e => setInput(s.stopOrder, 'alighted', parseInt(e.target.value) || 0)}
                      style={{ width: 70 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canSeeSums && (
            <div style={{ marginBottom: 10 }}>
              <strong>Total cursă: {currentTotal()} lei</strong> (rata: {tariff.ratePerKmSuburban} lei/km)
            </div>
          )}
          <button className="btn btn-primary" onClick={save}>Salvează cursa</button>
          {saveMsg && <span style={{ marginLeft: 12 }}>{saveMsg}</span>}
        </div>
      )}
    </div>
  );
}
