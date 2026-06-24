'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Calendar, Banknote, AlertTriangle } from 'lucide-react';
import {
  getCashFuel,
  getCashCountByVehicle,
  createCashFuel,
  deleteCashFuel,
  type CashFuelRow,
  type VehicleOption,
  type DriverOption,
} from './actions';

function lei(n: number): string {
  return Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' lei';
}

function litriFmt(n: number): string {
  return Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' L';
}

function dateTimeFmt(iso: string): string {
  return new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 'YYYY-MM' → valoare implicită pentru datetime-local (prima zi a lunii, 12:00)
function defaultDateTime(month: string): string {
  return `${month}-01T12:00`;
}

export default function NumerarClient({
  initialMonth,
  initialRows,
  initialCounts,
  vehicles,
  drivers,
}: {
  initialMonth: string;
  initialRows: CashFuelRow[];
  initialCounts: Record<string, number>;
  vehicles: VehicleOption[];
  drivers: DriverOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(initialMonth);
  const [rows, setRows] = useState<CashFuelRow[]>(initialRows);
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);

  // Form
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [alimentatAt, setAlimentatAt] = useState(defaultDateTime(initialMonth));
  const [litri, setLitri] = useState('');
  const [suma, setSuma] = useState('');
  const [statie, setStatie] = useState('');
  const [notes, setNotes] = useState('');

  async function reload(m: string) {
    const [r, c] = await Promise.all([getCashFuel(m), getCashCountByVehicle(m)]);
    setRows(r);
    setCounts(c);
  }

  function handleMonthChange(m: string) {
    setMonth(m);
    setAlimentatAt(defaultDateTime(m));
    setError(null);
    startTransition(async () => {
      try {
        await reload(m);
      } catch (e: any) {
        setError(e.message || 'Eroare la încărcare');
      }
    });
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      try {
        await createCashFuel({
          vehicle_id: vehicleId,
          driver_id: driverId || undefined,
          alimentat_at: alimentatAt,
          litri: Number(litri),
          suma_lei: Number(suma),
          statie,
          notes,
        });
        setLitri('');
        setSuma('');
        setStatie('');
        setNotes('');
        await reload(month);
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la adăugare');
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm('Sigur ștergeți această alimentare?')) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteCashFuel(id);
        await reload(month);
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la ștergere');
      }
    });
  }

  const totalLitri = rows.reduce((s, r) => s + Number(r.litri), 0);
  const totalSuma = rows.reduce((s, r) => s + Number(r.suma_lei), 0);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Alimentări numerar</h1>
      </div>

      {/* Banner informativ */}
      <div className="card mb-4" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <Banknote size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span className="text-muted">
          Litrii numerar intră în calculul total перерасход — vezi <strong>Alerte DT</strong>.
        </span>
      </div>

      {error && <p style={{ color: 'var(--warning)', fontSize: 14, marginBottom: 12 }}>{error}</p>}

      {/* Form adăugare */}
      <div className="card mb-4">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Adaugă alimentare numerar</h3>
        <div className="flex gap-2" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Mașină</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">— Selectează —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate_number}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Șofer (opțional)</label>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">— Necunoscut —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Data și ora</label>
            <input
              type="datetime-local"
              value={alimentatAt}
              onChange={(e) => setAlimentatAt(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 110 }}>
            <label>Litri</label>
            <input type="number" min="0" step="0.01" value={litri} onChange={(e) => setLitri(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 120 }}>
            <label>Sumă (lei)</label>
            <input type="number" min="0" step="0.01" value={suma} onChange={(e) => setSuma(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
            <label>Stație</label>
            <input type="text" value={statie} onChange={(e) => setStatie(e.target.value)} placeholder="ex: Petrom Bălți" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
            <label>Note</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opțional" />
          </div>
          <button className="btn btn-primary" disabled={pending} onClick={handleAdd}>
            <Plus size={16} style={{ marginRight: 4 }} />
            {pending ? 'Se salvează…' : 'Adaugă'}
          </button>
        </div>
      </div>

      {/* Selector lună + tabel */}
      <div className="card">
        <div className="flex gap-2 mb-4" style={{ alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label><Calendar size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Lună</label>
            <input type="month" value={month} onChange={(e) => handleMonthChange(e.target.value)} />
          </div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Total: <strong style={{ color: 'var(--primary)' }}>{litriFmt(totalLitri)}</strong>
            {' · '}
            <strong style={{ color: 'var(--primary)' }}>{lei(totalSuma)}</strong>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Mașină</th>
              <th>Șofer</th>
              <th>Data</th>
              <th>Litri</th>
              <th>Sumă</th>
              <th>Stație</th>
              <th>Note</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted">Nicio alimentare numerar pentru luna selectată.</td></tr>
            )}
            {rows.map((r) => {
              const suspect = (counts[r.vehicle_id] ?? 0) > 1;
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.vehicle_plate}
                    {suspect && (
                      <span
                        className="badge"
                        style={{ marginLeft: 6, background: 'var(--warning-bg, #fef3c7)', color: 'var(--warning, #b45309)' }}
                        title="Pattern suspect: peste o alimentare numerar în această lună"
                      >
                        <AlertTriangle size={11} style={{ marginRight: 2, verticalAlign: 'middle' }} />
                        {counts[r.vehicle_id]}×
                      </span>
                    )}
                  </td>
                  <td>{r.driver_name ?? <span className="text-muted">—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{dateTimeFmt(r.alimentat_at)}</td>
                  <td>{litriFmt(r.litri)}</td>
                  <td style={{ fontWeight: 600 }}>{lei(r.suma_lei)}</td>
                  <td>{r.statie}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{r.notes || '—'}</td>
                  <td>
                    <button className="btn btn-danger" disabled={pending} onClick={() => handleDelete(r.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
