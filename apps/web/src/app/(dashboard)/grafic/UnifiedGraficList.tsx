'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getGraficData,
  getGraficSuburban,
  upsertAssignment,
  deleteAssignment,
  setCashinReceipt,
  setRouteCancellation,
  type GraficRow,
  type SuburbanGraficRow,
  type DriverOption,
  type VehicleOption,
} from './actions';
import type { AdminRole } from '@translux/db';
import { validateRow, errorMessageRo } from './validation';

/**
 * Lista unificată interurban + suburban pentru dispecer / admin.
 * Formatul vechi (cu logo + PNG export) ramane doar pentru rolul GRAFIC.
 */

type UnifiedRow = {
  kind: 'inter' | 'sub';
  key: string;
  crm_route_id: number;
  time_label: string;         // "07:05" pentru inter, "—" pentru sub
  direction: string;          // "Chișinău - Lipcani" sau "Beleavinți → Briceni"
  cycles: string;             // "—" pentru inter, "7" pentru sub
  assignment_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  foaie_parcurs_nr: string | null;
  cancelled: boolean;
};

export default function UnifiedGraficList({
  date,
  drivers,
  vehicles,
  role,
  readOnly = false,
  onInvalidCountChange,
}: {
  date: string;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  role: AdminRole;
  readOnly?: boolean;
  onInvalidCountChange?: (count: number) => void;
}) {
  const isDispatcher = role === 'DISPATCHER';
  // Admin vede coloana (citire); dispecer — editabil; GRAFIC — ascuns.
  const canSeeReceipt = role === 'ADMIN' || role === 'DISPATCHER';

  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [inter, sub] = await Promise.all([
        getGraficData(date),
        getGraficSuburban(date),
      ]);
      const interurban: UnifiedRow[] = [...inter.page1, ...inter.page2].map((r: GraficRow) => ({
        kind: 'inter',
        key: `inter-${r.crm_route_id}`,
        crm_route_id: r.crm_route_id,
        time_label: r.time_nord || '—',
        direction: r.dest_to,
        cycles: '—',
        assignment_id: r.assignment_id,
        driver_id: r.driver_id,
        driver_name: r.driver_name,
        vehicle_id: r.vehicle_id,
        vehicle_plate: r.vehicle_plate,
        foaie_parcurs_nr: r.cashin_receipt_nr,
        cancelled: r.cancelled,
      }));
      const suburban: UnifiedRow[] = sub.map((r: SuburbanGraficRow) => ({
        kind: 'sub',
        key: `sub-${r.crm_route_id}`,
        crm_route_id: r.crm_route_id,
        time_label: '—',
        direction: `${r.dest_from_ro} → ${r.dest_to_ro}`,
        cycles: r.cycles ? String(r.cycles) : '—',
        assignment_id: r.assignment_id,
        driver_id: r.driver_id,
        driver_name: r.driver_name,
        vehicle_id: r.vehicle_id,
        vehicle_plate: r.vehicle_plate,
        foaie_parcurs_nr: r.cashin_receipt_nr,
        cancelled: r.cancelled,
      }));
      setRows([...interurban, ...suburban]);
    } catch (err: any) {
      setError(err.message || 'Eroare');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  async function handleDriverChange(row: UnifiedRow, driverId: string) {
    if (readOnly) return;
    setSavingKey(row.key);
    try {
      if (driverId === '') {
        if (row.assignment_id) {
          const res = await deleteAssignment(row.assignment_id);
          if (res.error) { setError(res.error); return; }
        }
      } else {
        const res = await upsertAssignment(
          row.crm_route_id, date, driverId, row.vehicle_id, null,
        );
        if (res.error) { setError(res.error); return; }
      }
      await load();
    } finally {
      setSavingKey(null);
    }
  }

  async function handleVehicleChange(row: UnifiedRow, vehicleId: string) {
    if (readOnly || !row.driver_id) return;
    setSavingKey(row.key);
    try {
      const res = await upsertAssignment(
        row.crm_route_id, date, row.driver_id, vehicleId || null, null,
      );
      if (res.error) { setError(res.error); return; }
      await load();
    } finally {
      setSavingKey(null);
    }
  }

  async function handleCancelToggle(row: UnifiedRow, value: boolean) {
    if (!isDispatcher) return;
    setSavingKey(row.key);
    try {
      const res = await setRouteCancellation(row.crm_route_id, date, value);
      if (res.error) { setError(res.error); return; }
      await load();
    } finally {
      setSavingKey(null);
    }
  }

  async function handleReceiptCommit(row: UnifiedRow, value: string) {
    if (!isDispatcher || !row.driver_id) return;
    const cleaned = value.trim();
    if (cleaned === (row.foaie_parcurs_nr || '')) return;
    setSavingKey(row.key);
    try {
      const res = await setCashinReceipt(row.driver_id, date, cleaned);
      if (res.error) { setError(res.error); return; }
      await load();
    } finally {
      setSavingKey(null);
    }
  }

  // Validate each row: must be cancelled OR have driver+vehicle+foaie
  const validations = rows.map(r => validateRow(r));
  const neprocesate = validations.filter(v => !v.isValid).length;

  // Report invalid count to parent (must run unconditionally — Rules of Hooks)
  useEffect(() => {
    onInvalidCountChange?.(neprocesate);
  }, [neprocesate, onInvalidCountChange]);

  if (loading) {
    return <p className="text-muted" style={{ padding: 20 }}>Se încarcă…</p>;
  }

  // Separator între interurban și suburban
  const firstSubIdx = rows.findIndex(r => r.kind === 'sub');

  const anulate = rows.filter(r => r.cancelled).length;
  const completate = rows.length - neprocesate - anulate;

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Status summary */}
      {canSeeReceipt && (
        <div style={{
          display: 'flex',
          gap: 16,
          padding: '10px 14px',
          marginBottom: 12,
          background: neprocesate > 0 ? 'var(--danger-dim)' : 'var(--success-dim)',
          borderLeft: `4px solid ${neprocesate > 0 ? 'var(--danger)' : 'var(--success)'}`,
          borderRadius: 'var(--radius-xs)',
          fontSize: 13,
          flexWrap: 'wrap',
        }}>
          <span>
            <strong style={{ color: completate > 0 ? 'var(--success)' : 'inherit' }}>✓ {completate}</strong> complete
          </span>
          <span>
            <strong style={{ color: anulate > 0 ? 'var(--text-muted)' : 'inherit' }}>⊘ {anulate}</strong> anulate
          </span>
          <span>
            <strong style={{ color: neprocesate > 0 ? 'var(--danger)' : 'var(--success)' }}>
              {neprocesate > 0 ? '⚠' : '✓'} {neprocesate}
            </strong> neprocesate
          </span>
          {neprocesate > 0 && (
            <span className="text-muted">
              Completează șofer + auto + foaie de parcurs sau bifează "Anulată" pentru fiecare.
            </span>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(155,27,48,0.06)' }}>
              <th style={{ width: 50, textAlign: 'left' }}>#</th>
              <th style={{ width: 70, textAlign: 'left' }}>Ora</th>
              <th style={{ textAlign: 'left' }}>Direcția</th>
              <th style={{ width: 70, textAlign: 'center' }}>Cicluri</th>
              <th style={{ width: 200, textAlign: 'left' }}>Șofer</th>
              <th style={{ width: 140, textAlign: 'left' }}>Auto</th>
              {canSeeReceipt && (
                <th style={{ width: 140, textAlign: 'left' }}>Foaie de parcurs</th>
              )}
              {canSeeReceipt && (
                <th style={{ width: 80, textAlign: 'center' }}>Anulată</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isFirstSub = i === firstSubIdx;
              return (
                <>
                  {isFirstSub && (
                    <tr key="sep-sub" style={{ background: 'rgba(155,27,48,0.04)' }}>
                      <td colSpan={canSeeReceipt ? 8 : 6} style={{
                        padding: '8px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        color: '#9B1B30',
                        fontStyle: 'italic',
                      }}>
                        Rute suburbane
                      </td>
                    </tr>
                  )}
                  <tr key={row.key} style={{
                    borderTop: '1px solid rgba(0,0,0,0.05)',
                    background: row.cancelled
                      ? 'rgba(0,0,0,0.03)'
                      : (canSeeReceipt && !validations[i].isValid)
                        ? 'var(--danger-dim)'
                        : undefined,
                    opacity: row.cancelled ? 0.55 : 1,
                  }}>
                    <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {row.time_label}
                    </td>
                    <td>
                      <strong>{row.direction}</strong>
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                      {row.cycles}
                    </td>
                    <td>
                      <select
                        value={row.driver_id || ''}
                        onChange={e => handleDriverChange(row, e.target.value)}
                        disabled={readOnly || savingKey === row.key}
                        style={inlineSelectStyle}
                      >
                        <option value="">— Selectează —</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.id}>{d.full_name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.vehicle_id || ''}
                        onChange={e => handleVehicleChange(row, e.target.value)}
                        disabled={readOnly || savingKey === row.key || !row.driver_id}
                        style={inlineSelectStyle}
                      >
                        <option value="">— Fără —</option>
                        {vehicles.map(v => (
                          <option key={v.id} value={v.id}>{v.plate_number}</option>
                        ))}
                      </select>
                    </td>
                    {canSeeReceipt && (
                      <td>
                        {isDispatcher ? (
                          <ReceiptInput
                            initial={row.foaie_parcurs_nr || ''}
                            disabled={!row.driver_id || row.cancelled || savingKey === row.key}
                            onCommit={value => handleReceiptCommit(row, value)}
                          />
                        ) : (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: row.foaie_parcurs_nr ? 'inherit' : 'var(--text-muted)' }}>
                            {row.foaie_parcurs_nr || '—'}
                          </span>
                        )}
                      </td>
                    )}
                    {canSeeReceipt && (
                      <td style={{ textAlign: 'center' }}>
                        {isDispatcher ? (
                          <input
                            type="checkbox"
                            checked={row.cancelled}
                            disabled={savingKey === row.key || !!row.foaie_parcurs_nr}
                            onChange={e => handleCancelToggle(row, e.target.checked)}
                            title={row.foaie_parcurs_nr
                              ? 'Nu poți marca cursa anulată dacă are foaie de parcurs. Șterge foaia mai întâi.'
                              : 'Bifează dacă cursa nu s-a efectuat'
                            }
                            style={{ width: 18, height: 18, cursor: row.foaie_parcurs_nr ? 'not-allowed' : 'pointer' }}
                          />
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>
                            {row.cancelled ? '⊘' : ''}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                  {canSeeReceipt && !validations[i].isValid && (
                    <tr key={`${row.key}-err`}>
                      <td colSpan={8} style={{
                        padding: '4px 12px 8px 12px',
                        background: 'var(--danger-dim)',
                        color: 'var(--danger)',
                        fontSize: 12,
                        fontWeight: 500,
                        borderTop: 'none',
                      }}>
                        ⚠ {errorMessageRo(validations[i].missing)}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canSeeReceipt ? 8 : 6} className="text-center text-muted" style={{ padding: 20 }}>
                  Nu există rute active.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReceiptInput({
  initial,
  disabled,
  onCommit,
}: {
  initial: string;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => { setValue(initial); }, [initial]);

  return (
    <input
      value={value}
      onChange={e => setValue(e.target.value.replace(/\D/g, ''))}
      onBlur={() => onCommit(value)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      disabled={disabled}
      placeholder="0945xxx"
      maxLength={10}
      style={{
        width: '100%',
        padding: '4px 8px',
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        border: '1px solid rgba(0,0,0,0.12)',
        borderRadius: 6,
        background: disabled ? '#f5f5f5' : '#fff',
      }}
    />
  );
}

const inlineSelectStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  fontSize: 13,
  border: '1px solid rgba(0,0,0,0.12)',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
};
