'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { saveDirection, getRouteStops, type RouteStop, type TariffConfig, type SavedEntry } from './actions';
import { calculateDirection, getEligibleBoardingStops, type StopEntry, type ShortPassengerGroup } from './calculation';
import ShortPassengerPopup from './ShortPassengerPopup';

interface Props {
  sessionId: string;
  crmRouteId: number;
  stops: RouteStop[];
  tariff: TariffConfig;
  doubleTariff: boolean;
  sessionStatus: string;
  savedTur: SavedEntry[];
  savedRetur: SavedEntry[];
  onSaved: () => void;
}

interface EntryState {
  totalPassengers: string; // строка для input
  shortCount: string;
  shortPassengers: ShortPassengerGroup[];
}

export default function CountingForm({
  sessionId, crmRouteId, stops, tariff, doubleTariff, sessionStatus, savedTur, savedRetur, onSaved,
}: Props) {
  const [returStops, setReturStops] = useState<RouteStop[]>([]);
  const [turEntries, setTurEntries] = useState<Record<number, EntryState>>({});
  const [returEntries, setReturEntries] = useState<Record<number, EntryState>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [shortPopup, setShortPopup] = useState<{
    direction: 'tur' | 'retur';
    stopOrder: number;
    stopNameRo: string;
    kmFromStart: number;
    count: number;
    allStops: RouteStop[];
  } | null>(null);

  const turRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const returRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const shortRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const turReadOnly = sessionStatus === 'tur_done' || sessionStatus === 'completed';
  const returReadOnly = sessionStatus === 'completed';

  // Загрузка остановок Retur
  useEffect(() => {
    getRouteStops(crmRouteId, 'retur').then(setReturStops);
  }, [crmRouteId]);

  // Инициализация из сохранённых данных
  useEffect(() => {
    if (savedTur.length > 0) {
      const entries: Record<number, EntryState> = {};
      for (const e of savedTur) {
        entries[e.stopOrder] = {
          totalPassengers: String(e.totalPassengers),
          shortCount: e.shortPassengers.length > 0
            ? String(e.shortPassengers.reduce((s, sp) => s + sp.passengerCount, 0))
            : '',
          shortPassengers: e.shortPassengers.map(sp => ({
            boardedStopOrder: sp.boardedStopOrder,
            boardedStopNameRo: sp.boardedStopNameRo,
            kmDistance: sp.kmDistance,
            passengerCount: sp.passengerCount,
          })),
        };
      }
      setTurEntries(entries);
    }
  }, [savedTur]);

  useEffect(() => {
    if (savedRetur.length > 0) {
      const entries: Record<number, EntryState> = {};
      for (const e of savedRetur) {
        entries[e.stopOrder] = {
          totalPassengers: String(e.totalPassengers),
          shortCount: e.shortPassengers.length > 0
            ? String(e.shortPassengers.reduce((s, sp) => s + sp.passengerCount, 0))
            : '',
          shortPassengers: e.shortPassengers.map(sp => ({
            boardedStopOrder: sp.boardedStopOrder,
            boardedStopNameRo: sp.boardedStopNameRo,
            kmDistance: sp.kmDistance,
            passengerCount: sp.passengerCount,
          })),
        };
      }
      setReturEntries(entries);
    }
  }, [savedRetur]);

  // Фокус на первое поле Tur
  useEffect(() => {
    if (!turReadOnly && stops.length > 0) {
      const firstRef = turRefs.current[stops[0].stopOrder];
      if (firstRef) firstRef.focus();
    }
  }, [stops, turReadOnly]);

  function getEntries(direction: 'tur' | 'retur') {
    return direction === 'tur' ? turEntries : returEntries;
  }

  function setEntries(direction: 'tur' | 'retur', entries: Record<number, EntryState>) {
    if (direction === 'tur') setTurEntries(entries);
    else setReturEntries(entries);
  }

  function getStops(direction: 'tur' | 'retur') {
    return direction === 'tur' ? stops : returStops;
  }

  function getTotal(stopOrder: number, direction: 'tur' | 'retur'): number {
    const e = getEntries(direction)[stopOrder];
    return e ? parseInt(e.totalPassengers) || 0 : 0;
  }

  function getPrevTotal(stopOrder: number, direction: 'tur' | 'retur'): number {
    const dirStops = getStops(direction);
    const idx = dirStops.findIndex(s => s.stopOrder === stopOrder);
    if (idx <= 0) return 0;
    return getTotal(dirStops[idx - 1].stopOrder, direction);
  }

  function handleTotalChange(direction: 'tur' | 'retur', stopOrder: number, value: string) {
    const entries = { ...getEntries(direction) };
    entries[stopOrder] = {
      ...entries[stopOrder] || { totalPassengers: '', shortCount: '', shortPassengers: [] },
      totalPassengers: value,
    };
    setEntries(direction, entries);
  }

  function handleTotalKeyDown(
    direction: 'tur' | 'retur',
    stopOrder: number,
    e: React.KeyboardEvent,
  ) {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;

    const dirStops = getStops(direction);
    const idx = dirStops.findIndex(s => s.stopOrder === stopOrder);
    const currentTotal = getTotal(stopOrder, direction);
    const prevTotal = getPrevTotal(stopOrder, direction);
    const decreased = currentTotal < prevTotal;

    // Если число уменьшилось и двойной тариф — переходим в Scurți
    if (decreased && doubleTariff && e.key === 'Enter') {
      e.preventDefault();
      const shortRef = shortRefs.current[`${direction}-${stopOrder}`];
      if (shortRef) shortRef.focus();
      return;
    }

    // Иначе — следующая остановка
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx < dirStops.length - 1) {
        const nextOrder = dirStops[idx + 1].stopOrder;
        const refs = direction === 'tur' ? turRefs : returRefs;
        refs.current[nextOrder]?.focus();
      }
    }
  }

  function handleShortChange(direction: 'tur' | 'retur', stopOrder: number, value: string) {
    const entries = { ...getEntries(direction) };
    entries[stopOrder] = {
      ...entries[stopOrder] || { totalPassengers: '', shortCount: '', shortPassengers: [] },
      shortCount: value,
    };
    setEntries(direction, entries);
  }

  function handleShortKeyDown(
    direction: 'tur' | 'retur',
    stopOrder: number,
    stop: RouteStop,
    e: React.KeyboardEvent,
  ) {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const count = parseInt(getEntries(direction)[stopOrder]?.shortCount || '0') || 0;
    if (count > 0) {
      // Открываем popup
      setShortPopup({
        direction,
        stopOrder,
        stopNameRo: stop.nameRo,
        kmFromStart: stop.kmFromStart,
        count,
        allStops: getStops(direction),
      });
    } else {
      // Следующая остановка
      moveToNextStop(direction, stopOrder);
    }
  }

  function moveToNextStop(direction: 'tur' | 'retur', currentOrder: number) {
    const dirStops = getStops(direction);
    const idx = dirStops.findIndex(s => s.stopOrder === currentOrder);
    if (idx < dirStops.length - 1) {
      const nextOrder = dirStops[idx + 1].stopOrder;
      const refs = direction === 'tur' ? turRefs : returRefs;
      refs.current[nextOrder]?.focus();
    }
  }

  function handleShortConfirm(groups: ShortPassengerGroup[]) {
    if (!shortPopup) return;
    const { direction, stopOrder } = shortPopup;
    const entries = { ...getEntries(direction) };
    entries[stopOrder] = {
      ...entries[stopOrder],
      shortPassengers: groups,
    };
    setEntries(direction, entries);
    setShortPopup(null);
    moveToNextStop(direction, stopOrder);
  }

  function buildStopEntries(direction: 'tur' | 'retur'): StopEntry[] {
    const dirStops = getStops(direction);
    const entries = getEntries(direction);
    return dirStops.map(stop => {
      const e = entries[stop.stopOrder];
      return {
        stopOrder: stop.stopOrder,
        stopNameRo: stop.nameRo,
        kmFromStart: stop.kmFromStart,
        totalPassengers: e ? parseInt(e.totalPassengers) || 0 : 0,
        shortPassengers: e?.shortPassengers || [],
      };
    });
  }

  function calcResult(direction: 'tur' | 'retur') {
    const entries = buildStopEntries(direction);
    return calculateDirection(entries, tariff.ratePerKmLong, doubleTariff ? tariff.ratePerKmShort : tariff.ratePerKmLong);
  }

  const turResult = calcResult('tur');
  const returResult = calcResult('retur');

  async function handleSave(direction: 'tur' | 'retur') {
    setSaving(true);
    setError('');
    try {
      const entries = buildStopEntries(direction);
      const result = direction === 'tur' ? turResult : returResult;
      const saveEntries = entries.map(e => ({
        stopOrder: e.stopOrder,
        stopNameRo: e.stopNameRo,
        kmFromStart: e.kmFromStart,
        totalPassengers: e.totalPassengers,
        shortPassengers: e.shortPassengers.map(sp => ({
          boardedStopOrder: sp.boardedStopOrder,
          boardedStopNameRo: sp.boardedStopNameRo,
          kmDistance: sp.kmDistance,
          passengerCount: sp.passengerCount,
          amountLei: sp.kmDistance * sp.passengerCount * tariff.ratePerKmShort,
        })),
      }));

      const res = await saveDirection(sessionId, direction, saveEntries, Math.round(result.total));
      if (res.error) setError(res.error);
      else onSaved();
    } finally {
      setSaving(false);
    }
  }

  function renderColumn(direction: 'tur' | 'retur', dirStops: RouteStop[], readOnly: boolean) {
    const entries = getEntries(direction);
    const result = direction === 'tur' ? turResult : returResult;
    const refs = direction === 'tur' ? turRefs : returRefs;
    const label = direction === 'tur' ? 'Tur' : 'Retur';

    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ marginBottom: 8 }}>{label}</h3>
        <table className="table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ width: 30 }}>Nr</th>
              <th>Stația</th>
              <th style={{ width: 50 }}>Km</th>
              <th style={{ width: 70 }}>Total</th>
              <th style={{ width: 40 }}>±</th>
              {doubleTariff && <th style={{ width: 70 }}>Scurți</th>}
            </tr>
          </thead>
          <tbody>
            {dirStops.map((stop, idx) => {
              const entry = entries[stop.stopOrder];
              const total = parseInt(entry?.totalPassengers || '') || 0;
              const prev = idx > 0 ? (parseInt(entries[dirStops[idx - 1].stopOrder]?.totalPassengers || '') || 0) : 0;
              const delta = idx > 0 ? total - prev : total;
              const decreased = delta < 0;

              return (
                <tr key={stop.stopOrder} style={decreased ? { background: 'rgba(217, 119, 6, 0.08)' } : undefined}>
                  <td>{idx + 1}</td>
                  <td>{stop.nameRo}</td>
                  <td>{Math.round(stop.kmFromStart)}</td>
                  <td>
                    <input
                      ref={el => { refs.current[stop.stopOrder] = el; }}
                      type="number"
                      min={0}
                      value={entry?.totalPassengers ?? ''}
                      onChange={e => handleTotalChange(direction, stop.stopOrder, e.target.value)}
                      onKeyDown={e => handleTotalKeyDown(direction, stop.stopOrder, e)}
                      disabled={readOnly}
                      style={{ width: 60, textAlign: 'center' }}
                    />
                  </td>
                  <td style={{ color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {entry?.totalPassengers !== undefined && entry?.totalPassengers !== '' ? (delta > 0 ? `+${delta}` : delta) : ''}
                  </td>
                  {doubleTariff && (
                    <td>
                      {decreased ? (
                        <input
                          ref={el => { shortRefs.current[`${direction}-${stop.stopOrder}`] = el; }}
                          type="number"
                          min={0}
                          max={Math.abs(delta)}
                          value={entry?.shortCount ?? ''}
                          onChange={e => handleShortChange(direction, stop.stopOrder, e.target.value)}
                          onKeyDown={e => handleShortKeyDown(direction, stop.stopOrder, stop, e)}
                          placeholder="0"
                          disabled={readOnly}
                          style={{ width: 55, textAlign: 'center' }}
                        />
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          {doubleTariff && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Pasageri lungi:</span>
                <strong>{Math.round(result.longSum)} lei</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Pasageri scurți:</span>
                <strong>{Math.round(result.shortSum)} lei</strong>
              </div>
              <hr style={{ margin: '6px 0' }} />
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
            <span>Total {label}:</span>
            <strong>{Math.round(result.total)} lei</strong>
          </div>

          {!readOnly && (
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => handleSave(direction)}
              disabled={saving}
            >
              {saving ? 'Se salvează...' : `Salvează ${label}`}
            </button>
          )}
          {readOnly && <p className="text-muted" style={{ marginTop: 8, textAlign: 'center' }}>Salvat ✅</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, background: 'var(--primary-dim)' }}>
      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 24 }}>
        {renderColumn('tur', stops, turReadOnly)}
        {returStops.length > 0 && renderColumn('retur', returStops, returReadOnly)}
      </div>

      {turResult.total > 0 && returResult.total > 0 && (
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 18 }}>
          <strong>Total cursă: {Math.round(turResult.total + returResult.total)} lei</strong>
        </div>
      )}

      {shortPopup && (
        <ShortPassengerPopup
          exitStopOrder={shortPopup.stopOrder}
          exitStopNameRo={shortPopup.stopNameRo}
          exitKm={shortPopup.kmFromStart}
          totalShort={shortPopup.count}
          allStops={shortPopup.allStops}
          maxKm={50}
          onConfirm={handleShortConfirm}
          onCancel={() => { setShortPopup(null); moveToNextStop(shortPopup.direction, shortPopup.stopOrder); }}
        />
      )}
    </div>
  );
}
