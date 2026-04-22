'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getGraficSuburban,
  upsertAssignment,
  deleteAssignment,
  setCashinReceipt,
  type SuburbanGraficRow,
  type DriverOption,
  type VehicleOption,
} from './actions';
import type { AdminRole } from '@translux/db';

export default function SuburbanGraficTab({
  date,
  drivers,
  vehicles,
  role,
  readOnly = false,
}: {
  date: string;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  role: AdminRole;
  readOnly?: boolean;
}) {
  const isDispatcher = role === 'DISPATCHER';

  const [rows, setRows] = useState<SuburbanGraficRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingRow, setSavingRow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGraficSuburban(date);
      setRows(data);
    } catch (err: any) {
      setError(err.message || 'Eroare');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  async function handleDriverChange(row: SuburbanGraficRow, driverId: string) {
    if (readOnly) return;
    setSavingRow(row.crm_route_id);
    try {
      if (driverId === '') {
        // Clear: remove assignment if exists
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
      setSavingRow(null);
    }
  }

  async function handleVehicleChange(row: SuburbanGraficRow, vehicleId: string) {
    if (readOnly || !row.driver_id) return;
    setSavingRow(row.crm_route_id);
    try {
      const res = await upsertAssignment(
        row.crm_route_id, date, row.driver_id, vehicleId || null, null,
      );
      if (res.error) { setError(res.error); return; }
      await load();
    } finally {
      setSavingRow(null);
    }
  }

  async function handleReceiptBlur(row: SuburbanGraficRow, value: string) {
    if (!isDispatcher || !row.driver_id) return;
    const cleaned = value.trim();
    if (cleaned === (row.cashin_receipt_nr || '')) return;
    setSavingRow(row.crm_route_id);
    try {
      const res = await setCashinReceipt(row.driver_id, date, cleaned);
      if (res.error) { setError(res.error); return; }
      await load();
    } finally {
      setSavingRow(null);
    }
  }

  if (loading) {
    return <p className="text-muted" style={{ padding: 20 }}>Se încarcă…</p>;
  }

  return (
    <div>
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(155,27,48,0.06)' }}>
              <th style={{ width: 50, textAlign: 'left' }}>#</th>
              <th style={{ textAlign: 'left' }}>Direcția</th>
              <th style={{ width: 80, textAlign: 'center' }}>Cicluri</th>
              <th style={{ width: 200, textAlign: 'left' }}>Șofer</th>
              <th style={{ width: 140, textAlign: 'left' }}>Auto</th>
              {isDispatcher && (
                <th style={{ width: 140, textAlign: 'left' }}>Chitanță</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.crm_route_id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                <td>
                  <strong>{row.dest_from_ro}</strong>
                  {' → '}{row.dest_to_ro}
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                  {row.cycles || '—'}
                </td>
                <td>
                  <select
                    value={row.driver_id || ''}
                    onChange={e => handleDriverChange(row, e.target.value)}
                    disabled={readOnly || savingRow === row.crm_route_id}
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
                    disabled={readOnly || savingRow === row.crm_route_id || !row.driver_id}
                    style={inlineSelectStyle}
                  >
                    <option value="">— Fără —</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.plate_number}</option>
                    ))}
                  </select>
                </td>
                {isDispatcher && (
                  <td>
                    <ReceiptInput
                      initial={row.cashin_receipt_nr || ''}
                      disabled={!row.driver_id || savingRow === row.crm_route_id}
                      onCommit={value => handleReceiptBlur(row, value)}
                    />
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={isDispatcher ? 6 : 5} className="text-center text-muted" style={{ padding: 20 }}>
                  Nu există rute suburbane active.
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
