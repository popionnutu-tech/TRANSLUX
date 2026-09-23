'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  LDE_VEHICLE_CATEGORY_LABELS,
  type LdeVehicleType,
  type LdeOverrideReason,
} from '@translux/db';
import {
  assignVehicleType,
  setMeasuredOverride,
  clearMeasured,
  toggleInRepair,
  setVehicleHome,
  type LdeVehicleNormRow,
} from './actions';

// Motivul override-ului (RO) — nu există label-map în @translux/db, îl ținem local.
const OVERRIDE_REASON_LABELS: Record<LdeOverrideReason, string> = {
  reparatie_tehnica: 'Reparație tehnică',
  actualizare_norma: 'Actualizare normă',
  verificare_norma: 'Verificare normă',
};
const OVERRIDE_REASON_OPTIONS = Object.entries(OVERRIDE_REASON_LABELS) as [LdeOverrideReason, string][];

const fmtNorm = (n: number | null) => (n == null ? '—' : `${n} l/100km`);

type FilterMode = 'all' | 'no_type' | 'override';

export default function VehiculeClient({
  initialVehicule,
  types,
}: {
  initialVehicule: LdeVehicleNormRow[];
  types: LdeVehicleType[];
}) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    if (filter === 'no_type') return initialVehicule.filter(r => !r.has_type);
    if (filter === 'override') return initialVehicule.filter(r => r.measured != null);
    return initialVehicule;
  }, [initialVehicule, filter]);

  const noTypeCount = initialVehicule.filter(r => !r.has_type).length;
  const overrideCount = initialVehicule.filter(r => r.measured != null).length;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Mașini LDE — tip & normă</h1>
      </div>

      <div className="card mb-4" style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 240 }}>
          <label>Filtru</label>
          <select value={filter} onChange={e => setFilter(e.target.value as FilterMode)}>
            <option value="all">Toate mașinile</option>
            <option value="no_type">Doar fără tip (DT inactiv)</option>
            <option value="override">Doar cu override</option>
          </select>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>
          {filtered.length} mașini
          {noTypeCount > 0 && (
            <span style={{ marginLeft: 12, color: '#dc2626' }}>
              · {noTypeCount} fără tip
            </span>
          )}
          {overrideCount > 0 && (
            <span style={{ marginLeft: 12 }}>· {overrideCount} cu override</span>
          )}
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
              <th>Normă tip</th>
              <th>Consum măsurat</th>
              <th>Normă efectivă</th>
              <th>Locul de trai</th>
              <th>În reparație</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <VehiculRow key={row.vehicle_id} row={row} types={types} onError={setError} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted">
                  Nu există mașini pentru acest filtru.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VehiculRow({
  row,
  types,
  onError,
}: {
  row: LdeVehicleNormRow;
  types: LdeVehicleType[];
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editField, setEditField] = useState<null | 'type' | 'measured' | 'home'>(null);
  const [draftLoc, setDraftLoc] = useState<string>(row.home_locality ?? '');
  const [draftSofer, setDraftSofer] = useState<string>(row.home_driver ?? '');
  const [draftDin, setDraftDin] = useState<string>(row.home_since ?? '');
  const [draftType, setDraftType] = useState<string>(row.vehicle_type_id ?? '');
  const [draftMeasured, setDraftMeasured] = useState<string>(row.measured?.toString() ?? '');
  const [draftLoaded, setDraftLoaded] = useState<string>(row.measured_loaded?.toString() ?? '');
  const [draftReason, setDraftReason] = useState<string>(row.override_reason ?? '');

  function run(fn: () => Promise<void>) {
    onError('');
    startTransition(async () => {
      try {
        await fn();
        setEditField(null);
        router.refresh();
      } catch (err: any) {
        onError(err?.message || 'Eroare la salvare');
      }
    });
  }

  const rowStyle: React.CSSProperties = !row.has_type ? { backgroundColor: '#fef2f2' } : {};

  return (
    <tr style={rowStyle}>
      {/* Mașină */}
      <td style={{ fontWeight: 600 }}>
        {row.plate_number}
        {!row.has_type && (
          <div
            className="badge"
            style={{
              marginTop: 4,
              background: '#fee2e2',
              color: '#991b1b',
              border: '1px solid #fecaca',
              fontSize: 11,
            }}
          >
            Fără tip — DT inactiv
          </div>
        )}
      </td>

      {/* Tip (dropdown editabil) */}
      <td>
        {editField === 'type' ? (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select
              autoFocus
              value={draftType}
              onChange={e => setDraftType(e.target.value)}
              style={{ fontSize: 13, padding: '2px 6px' }}
            >
              <option value="">— alege tip —</option>
              {types.map(t => (
                <option key={t.id} value={t.id}>
                  {t.display_name} ({LDE_VEHICLE_CATEGORY_LABELS[t.category]})
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isPending || !draftType}
              onClick={() => run(() => assignVehicleType(row.vehicle_id, draftType))}
            >
              {isPending ? '...' : '✓'}
            </button>
            <button
              className="btn btn-outline"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => { setDraftType(row.vehicle_type_id ?? ''); setEditField(null); }}
            >✕</button>
          </span>
        ) : (
          <span
            onClick={() => setEditField('type')}
            style={{ cursor: 'pointer', color: row.has_type ? undefined : '#dc2626' }}
          >
            {row.type_name ?? '— atribuie —'}
          </span>
        )}
      </td>

      {/* Normă tip */}
      <td>{fmtNorm(row.norm_type)}</td>

      {/* Consum măsurat (editabil) */}
      <td>
        {editField === 'measured' ? (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              autoFocus
              type="number"
              step="0.01"
              min="0"
              value={draftMeasured}
              onChange={e => setDraftMeasured(e.target.value)}
              placeholder="gol l/100km"
              style={{ width: 90, fontSize: 13, padding: '2px 6px' }}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={draftLoaded}
              onChange={e => setDraftLoaded(e.target.value)}
              placeholder="încărcat (opț.)"
              title="Doar camioane: consum încărcat (max interval)"
              style={{ width: 110, fontSize: 13, padding: '2px 6px' }}
            />
            <select
              value={draftReason}
              onChange={e => setDraftReason(e.target.value)}
              style={{ fontSize: 12, padding: '2px 6px' }}
            >
              <option value="">— motiv —</option>
              {OVERRIDE_REASON_OPTIONS.map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isPending || !draftMeasured}
              onClick={() =>
                run(() =>
                  setMeasuredOverride(
                    row.vehicle_id,
                    Number(draftMeasured),
                    (draftReason || null) as LdeOverrideReason | null,
                    draftLoaded ? Number(draftLoaded) : null
                  )
                )
              }
            >
              {isPending ? '...' : '✓'}
            </button>
            <button
              className="btn btn-outline"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => {
                setDraftMeasured(row.measured?.toString() ?? '');
                setDraftLoaded(row.measured_loaded?.toString() ?? '');
                setDraftReason(row.override_reason ?? '');
                setEditField(null);
              }}
            >✕</button>
          </span>
        ) : row.measured != null ? (
          <span
            onClick={() => row.has_type && setEditField('measured')}
            style={{ cursor: row.has_type ? 'pointer' : 'default' }}
            title={row.override_reason ? OVERRIDE_REASON_LABELS[row.override_reason] : undefined}
          >
            <strong>{row.measured}{row.measured_loaded != null ? `–${row.measured_loaded}` : ''}</strong> l/100km
            {row.override_reason && (
              <span style={{ marginLeft: 6, fontSize: 11, color: '#888' }}>
                ({OVERRIDE_REASON_LABELS[row.override_reason]})
              </span>
            )}
          </span>
        ) : row.has_type ? (
          <button
            onClick={() => setEditField('measured')}
            style={{ fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', color: '#666', textDecoration: 'underline' }}
          >
            + override
          </button>
        ) : (
          <span style={{ color: '#bbb' }}>—</span>
        )}
      </td>

      {/* Normă efectivă */}
      <td style={{ fontWeight: 600 }}>
        {fmtNorm(row.effective_norm)}
        {row.measured != null && (
          <span
            className="badge"
            style={{ marginLeft: 6, fontSize: 10, background: '#eef2ff', color: '#3730a3' }}
          >
            override
          </span>
        )}
      </td>

      {/* Locul de trai — Ion, 23.09: «bagă în nomenclator la mașină locul de trai» și
          «dacă el se schimbă — apare alt șofer — schimb locul de trai». Valoarea declarată
          stă deasupra, observația din GPS dedesubt; când se despart, s-a schimbat omul. */}
      <td style={{ minWidth: 190 }}>
        {editField === 'home' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input autoFocus value={draftLoc} onChange={e => setDraftLoc(e.target.value)}
              placeholder="Satul" style={{ fontSize: 13, padding: '2px 6px' }} />
            <input value={draftSofer} onChange={e => setDraftSofer(e.target.value)}
              placeholder="Șoferul" style={{ fontSize: 13, padding: '2px 6px' }} />
            <input type="date" value={draftDin} onChange={e => setDraftDin(e.target.value)}
              title="De când" style={{ fontSize: 13, padding: '2px 6px' }} />
            <span style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-primary" disabled={isPending} style={{ fontSize: 12, padding: '3px 8px' }}
                onClick={() => run(() => setVehicleHome(row.vehicle_id, {
                  locality: draftLoc, driver: draftSofer, since: draftDin || null, note: row.home_note,
                }))}>Salvează</button>
              <button className="btn btn-outline" disabled={isPending} style={{ fontSize: 12, padding: '3px 8px' }}
                onClick={() => setEditField(null)}>Anulează</button>
            </span>
          </div>
        ) : (
          <div>
            {/* Ion, 23.09: «de mine nimeni niciodată nu va introduce». Deci coloana nu cere
                nimic de la nimeni: locul de trai ESTE odihna din GPS și se mută singur.
                Scrisul cu mâna rămâne doar ca portiță, pentru cazuri pe care GPS-ul nu le
                poate ști — o reparație lungă, o înlocuire de câteva zile — și nu se vede
                până nu e nevoie de el. Nimic din sistem nu așteaptă să fie completat. */}
            <span style={{ fontWeight: 600 }}>
              {row.home_locality ?? row.gps_recent ?? row.gps_home
                ?? <span className="text-muted" style={{ fontWeight: 400 }}>n-a dormit nicăieri constant</span>}
            </span>

            <div className="text-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              {row.home_locality
                ? <>pus cu mâna{row.home_since ? ` · din ${row.home_since}` : ''}{row.home_driver ? ` · ${row.home_driver}` : ''}</>
                : row.gps_recent
                  ? <>din odihnă · {row.gps_nopti_recent} nopți din ultimele 7</>
                  : <>fără odihnă constantă în 30 de zile</>}
            </div>

            {row.gps_ultima && (
              <div className="text-muted" style={{ fontSize: 11 }}>
                azi-noapte: {row.gps_ultima}{row.gps_ultima_zi ? ` (${row.gps_ultima_zi})` : ''}
              </div>
            )}

            {/* Mutarea se vede din fereastra de 7 zile față de cea de 30: media pe o lună
                s-ar muta abia peste săptămâni, iar schimbarea de șofer trebuie văzută azi. */}
            {row.gps_recent && row.gps_home && row.gps_recent !== row.gps_home && (
              <div className="badge badge-absent" style={{ marginTop: 3, fontSize: 10.5 }}>
                S-a mutat: {row.gps_home} → {row.gps_recent}
              </div>
            )}
            {row.home_locality && row.gps_recent && row.home_locality !== row.gps_recent && (
              <div className="badge badge-cancelled" style={{ marginTop: 3, fontSize: 10.5 }}>
                Pus {row.home_locality}, doarme la {row.gps_recent}
              </div>
            )}

            <button
              onClick={() => { setDraftLoc(row.home_locality ?? ''); setEditField('home'); }}
              title="Doar dacă GPS-ul greșește: reparație lungă, înlocuire de câteva zile"
              style={{
                background: 'none', border: 0, padding: 0, marginTop: 3, cursor: 'pointer',
                font: 'inherit', fontSize: 10.5, color: 'var(--text-muted)', textDecoration: 'underline',
              }}
            >
              {row.home_locality ? 'schimbă' : 'corectează'}
            </button>
          </div>
        )}
      </td>

      {/* În reparație */}
      <td>
        {row.has_type ? (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={row.in_repair}
              disabled={isPending}
              onChange={e => run(() => toggleInRepair(row.vehicle_id, e.target.checked))}
            />
            <span className={`badge ${row.in_repair ? 'badge-absent' : 'badge-ok'}`}>
              {row.in_repair ? 'În reparație' : 'OK'}
            </span>
          </label>
        ) : (
          <span style={{ color: '#bbb' }}>—</span>
        )}
      </td>

      {/* Acțiuni */}
      <td>
        {row.measured != null && (
          <button
            className="btn btn-outline"
            style={{ fontSize: 11, padding: '2px 8px' }}
            disabled={isPending}
            onClick={() => run(() => clearMeasured(row.vehicle_id))}
            title="Revine la norma tipului"
          >
            Șterge override
          </button>
        )}
      </td>
    </tr>
  );
}
