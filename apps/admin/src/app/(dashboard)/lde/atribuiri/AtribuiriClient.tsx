'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LdeShiftNumber } from '@translux/db';
import {
  createAssignment,
  endAssignment,
  deleteAssignment,
  type AssignmentRow,
  type CreateOptions,
} from './actions';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AtribuiriClient({
  initialAssignments,
  options,
}: {
  initialAssignments: AssignmentRow[];
  options: CreateOptions;
}) {
  const router = useRouter();

  // ── Filtre ──────────────────────────────────────────────────────────────────
  const [uzinaFilter, setUzinaFilter] = useState<string>('');
  const [activeOnly, setActiveOnly] = useState<boolean>(true);

  // ── Formular adăugare ───────────────────────────────────────────────────────
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [shiftNumber, setShiftNumber] = useState<string>(''); // '' | '1' | '2' | '3'
  const [validFrom, setValidFrom] = useState<string>(todayIso());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Filtrare client-side (rapidă, fără round-trip) ──────────────────────────
  const visibleRows = useMemo(() => {
    return initialAssignments.filter((r) => {
      if (activeOnly && r.valid_to !== null) return false;
      if (uzinaFilter && r.route_uzina_id !== uzinaFilter) return false;
      return true;
    });
  }, [initialAssignments, activeOnly, uzinaFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!driverId) {
      setError('Selectează un șofer');
      return;
    }
    if (!vehicleId) {
      setError('Selectează o mașină');
      return;
    }
    setLoading(true);
    try {
      await createAssignment({
        driver_id: driverId,
        vehicle_id: vehicleId,
        route_id: routeId || null,
        shift_number: shiftNumber ? (Number(shiftNumber) as LdeShiftNumber) : null,
        valid_from: validFrom || todayIso(),
        notes: notes || null,
      });
      setDriverId('');
      setVehicleId('');
      setRouteId('');
      setShiftNumber('');
      setValidFrom(todayIso());
      setNotes('');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnd(id: string) {
    if (!confirm('Încheie această atribuire (valid_to = azi)?')) return;
    try {
      await endAssignment(id);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Ștergi DEFINITIV această atribuire? (folosește doar pentru greșeli)')) return;
    try {
      await deleteAssignment(id);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    }
  }

  // ── Mapă uzine pentru afișare nume în coloana «Cursă» ──────────────────────
  const uzinaNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of options.uzine) m.set(u.id, u.display_name);
    return m;
  }, [options.uzine]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Atribuiri (șofer ↔ mașină ↔ cursă)</h1>
      </div>

      {/* ── Bară filtre ───────────────────────────────────────────────────── */}
      <div className="card mb-4">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Uzina</label>
            <select value={uzinaFilter} onChange={(e) => setUzinaFilter(e.target.value)}>
              <option value="">Toate</option>
              {options.uzine.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              Doar atribuiri active
            </label>
          </div>
        </div>
      </div>

      {/* ── Formular adăugare ─────────────────────────────────────────────── */}
      <div className="card mb-4">
        <h3 style={{ marginTop: 0 }}>Adaugă atribuire</h3>
        <form
          onSubmit={handleCreate}
          style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}
        >
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Șofer *</label>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
              <option value="">— alege —</option>
              {options.drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Mașină *</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
              <option value="">— alege —</option>
              {options.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 260 }}>
            <label>Cursă (opțional)</label>
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">— fără cursă —</option>
              {options.factory_routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.uzina_display_name} · #{r.route_number}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 110 }}>
            <label>Schimb</label>
            <select value={shiftNumber} onChange={(e) => setShiftNumber(e.target.value)}>
              <option value="">—</option>
              <option value="1">Schimb 1</option>
              <option value="2">Schimb 2</option>
              <option value="3">Schimb 3</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
            <label>De la</label>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 200, flex: 1 }}>
            <label>Note</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: înlocuiește pe Ion pe perioada concediului"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Se salvează...' : 'Adaugă'}
          </button>
        </form>
        {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>{error}</p>}
      </div>

      {/* ── Tabel atribuiri ───────────────────────────────────────────────── */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Șofer</th>
              <th>Mașină</th>
              <th>Cursă</th>
              <th>Schimb</th>
              <th>De la</th>
              <th>Până la</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const isActive = row.valid_to === null;
              const cursaCell =
                row.route_id && row.route_number !== null
                  ? `${uzinaNameById.get(row.route_uzina_id || '') || row.route_uzina_id || '—'} · #${row.route_number}`
                  : '—';
              return (
                <tr key={row.id} style={{ opacity: isActive ? 1 : 0.6 }}>
                  <td style={{ fontWeight: 600 }}>{row.driver_full_name}</td>
                  <td>{row.vehicle_plate}</td>
                  <td>{cursaCell}</td>
                  <td>{row.shift_number ? `S${row.shift_number}` : '—'}</td>
                  <td>{row.valid_from}</td>
                  <td>
                    {isActive ? (
                      <span className="badge badge-ok">ACTIVĂ</span>
                    ) : (
                      <span className="badge badge-absent">{row.valid_to}</span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      {isActive && (
                        <button className="btn btn-outline" onClick={() => handleEnd(row.id)}>
                          Încheie
                        </button>
                      )}
                      <button className="btn btn-danger" onClick={() => handleDelete(row.id)}>
                        Șterge
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted">
                  Nu există atribuiri pentru filtrele curente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
