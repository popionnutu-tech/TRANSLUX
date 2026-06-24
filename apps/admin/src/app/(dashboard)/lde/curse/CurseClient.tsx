'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LdeFactoryRoute, LdeUzina } from '@translux/db';
import { getCurse, getCursaDetail, type CursaDetail } from './actions';

export default function CurseClient({
  initialCurse,
  uzinas,
}: {
  initialCurse: LdeFactoryRoute[];
  uzinas: LdeUzina[];
}) {
  const router = useRouter();
  const [uzinaId, setUzinaId] = useState<string>('');
  const [curse, setCurse] = useState<LdeFactoryRoute[]>(initialCurse);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, CursaDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const uzinaNameById = useMemo(
    () => new Map(uzinas.map((u) => [u.id, u.display_name])),
    [uzinas],
  );

  async function handleUzinaChange(value: string) {
    setUzinaId(value);
    setExpandedId(null);
    setError('');
    startTransition(async () => {
      try {
        const next = await getCurse(value || undefined);
        setCurse(next);
      } catch (err: any) {
        setError(err.message);
      }
    });
  }

  async function handleToggleExpand(routeId: string) {
    if (expandedId === routeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(routeId);
    if (!detailCache[routeId]) {
      setLoadingDetail(routeId);
      try {
        const detail = await getCursaDetail(routeId);
        setDetailCache((prev) => ({ ...prev, [routeId]: detail }));
      } catch (err: any) {
        setError(err.message);
        setExpandedId(null);
      } finally {
        setLoadingDetail(null);
      }
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Curse uzine</h1>
      </div>

      <div className="card mb-4">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 240 }}>
            <label>Uzină</label>
            <select
              value={uzinaId}
              onChange={(e) => handleUzinaChange(e.target.value)}
              disabled={isPending}
            >
              <option value="">Toate uzinele</option>
              {uzinas.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', paddingBottom: 6 }}>
            {curse.length} curse
          </div>
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>{error}</p>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 56 }}>#</th>
              {!uzinaId && <th>Uzină</th>}
              <th>Localități</th>
              <th style={{ width: 110 }}>Persoane</th>
              <th style={{ width: 160 }}>Schimburi</th>
            </tr>
          </thead>
          <tbody>
            {curse.map((c) => {
              const isOpen = expandedId === c.id;
              return (
                <CursaRow
                  key={c.id}
                  cursa={c}
                  uzinaName={uzinaNameById.get(c.uzina_id) || c.uzina_id}
                  showUzinaCol={!uzinaId}
                  isOpen={isOpen}
                  detail={detailCache[c.id]}
                  isLoadingDetail={loadingDetail === c.id}
                  onToggle={() => handleToggleExpand(c.id)}
                />
              );
            })}
            {curse.length === 0 && (
              <tr>
                <td colSpan={uzinaId ? 4 : 5} className="text-center text-muted">
                  Nu există curse.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CursaRow({
  cursa,
  uzinaName,
  showUzinaCol,
  isOpen,
  detail,
  isLoadingDetail,
  onToggle,
}: {
  cursa: LdeFactoryRoute;
  uzinaName: string;
  showUzinaCol: boolean;
  isOpen: boolean;
  detail: CursaDetail | undefined;
  isLoadingDetail: boolean;
  onToggle: () => void;
}) {
  const colCount = showUzinaCol ? 5 : 4;
  const shiftBadges: Array<{ n: 1 | 2 | 3; on: boolean }> = [
    { n: 1, on: cursa.has_shift1 },
    { n: 2, on: cursa.has_shift2 },
    { n: 3, on: cursa.has_shift3 },
  ];

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer', background: isOpen ? 'var(--bg-soft, #f8fafc)' : undefined }}
      >
        <td style={{ fontWeight: 600 }}>{cursa.route_number}</td>
        {showUzinaCol && <td>{uzinaName}</td>}
        <td>{cursa.stops_in_order}</td>
        <td>{cursa.total_passengers ?? '—'}</td>
        <td>
          <span style={{ display: 'inline-flex', gap: 6 }}>
            {shiftBadges.map((s) => (
              <span
                key={s.n}
                className={`badge ${s.on ? 'badge-ok' : 'badge-absent'}`}
                title={`Schimbul ${s.n}`}
              >
                s{s.n}
              </span>
            ))}
          </span>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={colCount} style={{ background: 'var(--bg-soft, #f8fafc)' }}>
            {isLoadingDetail || !detail ? (
              <div className="text-muted" style={{ padding: 12 }}>Se încarcă...</div>
            ) : (
              <CursaDetailPanel detail={detail} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function CursaDetailPanel({ detail }: { detail: CursaDetail }) {
  const { route, shifts, vehicles } = detail;
  if (shifts.length === 0) {
    return <div className="text-muted" style={{ padding: 12 }}>Fără schimburi configurate.</div>;
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {route.rotation_note && (
        <div style={{ fontSize: 13 }}>
          <strong>Rotație:</strong> {route.rotation_note}
        </div>
      )}
      {shifts.map((s) => {
        const v = vehicles.filter((x) => x.route_shift_id === s.id);
        return (
          <div
            key={s.id}
            style={{
              border: '1px solid var(--border, #e5e7eb)',
              borderRadius: 6,
              padding: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
              <span className="badge badge-ok">Schimbul {s.shift_number}</span>
              <span style={{ fontSize: 13 }}>
                <strong>{s.passengers_count}</strong> persoane
              </span>
              {s.notes && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.notes}</span>
              )}
            </div>
            {v.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>Fără autobuze atribuite.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {v.map((veh) => (
                  <li key={`${veh.route_shift_id}-${veh.vehicle_id}`}>
                    <strong>{veh.plate_number}</strong>
                    {veh.is_primary && (
                      <span
                        style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)' }}
                      >
                        (principal)
                      </span>
                    )}
                    {veh.rotation_note && (
                      <span style={{ marginLeft: 6, color: 'var(--muted)' }}>
                        — {veh.rotation_note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
