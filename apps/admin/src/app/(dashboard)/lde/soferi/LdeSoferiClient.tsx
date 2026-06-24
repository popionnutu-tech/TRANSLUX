'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  LDE_SALARY_CATEGORY_LABELS,
  LDE_PARKING_LABELS,
  type LdeParkingLocation,
  type LdeSalaryCategory,
  type LdeUzina,
} from '@translux/db';
import {
  updateLdeSoferExtras,
  type LdeSoferRow,
  type LdeSoferExtrasPatch,
} from './actions';

const PARKING_OPTIONS = Object.entries(LDE_PARKING_LABELS) as [LdeParkingLocation, string][];
const SALARY_OPTIONS = Object.entries(LDE_SALARY_CATEGORY_LABELS).map(
  ([k, label]) => [Number(k) as LdeSalaryCategory, label] as [LdeSalaryCategory, string]
);

export default function LdeSoferiClient({
  initialSoferi,
  uzine,
}: {
  initialSoferi: LdeSoferRow[];
  uzine: LdeUzina[];
}) {
  const [filterUzina, setFilterUzina] = useState<string>('ALL');
  const [error, setError] = useState('');

  const uzinaLabel = useMemo(() => {
    const m = new Map<string, string>();
    uzine.forEach(u => m.set(u.id, u.display_name));
    return m;
  }, [uzine]);

  const filtered = useMemo(() => {
    if (filterUzina === 'ALL') return initialSoferi;
    if (filterUzina === 'NONE') return initialSoferi.filter(r => r.uzina_id === null);
    return initialSoferi.filter(r => r.uzina_id === filterUzina);
  }, [initialSoferi, filterUzina]);

  const missingCount = initialSoferi.filter(r => !r.hasAddress).length;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Șoferi LDE</h1>
      </div>

      <div className="card mb-4" style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 260 }}>
          <label>Filtru uzină</label>
          <select value={filterUzina} onChange={e => setFilterUzina(e.target.value)}>
            <option value="ALL">Toate uzinele</option>
            <option value="NONE">Fără uzină (interurban/suburban)</option>
            {uzine.map(u => (
              <option key={u.id} value={u.id}>{u.display_name}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>
          {filtered.length} șoferi
          {missingCount > 0 && (
            <span style={{ marginLeft: 12, color: '#dc2626' }}>
              · {missingCount} fără adresă
            </span>
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
              <th>Nume</th>
              <th>Uzina</th>
              <th>Adresa</th>
              <th>Cat. salariu</th>
              <th>Parkare</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <SoferRow
                key={row.driver_id}
                row={row}
                uzine={uzine}
                uzinaLabel={uzinaLabel}
                onError={setError}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted">
                  Nu există șoferi pentru acest filtru.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SoferRow({
  row,
  uzine,
  uzinaLabel,
  onError,
}: {
  row: LdeSoferRow;
  uzine: LdeUzina[];
  uzinaLabel: Map<string, string>;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editField, setEditField] = useState<null | 'uzina' | 'address' | 'salary' | 'parking' | 'notes'>(null);
  const [draftUzina, setDraftUzina] = useState<string>(row.uzina_id ?? '');
  const [draftAddress, setDraftAddress] = useState(row.home_address ?? '');
  const [draftSalary, setDraftSalary] = useState<string>(row.lde_salary_category?.toString() ?? '');
  const [draftParking, setDraftParking] = useState<LdeParkingLocation>(row.parking_location);
  const [draftNotes, setDraftNotes] = useState(row.notes ?? '');

  function save(patch: LdeSoferExtrasPatch) {
    onError('');
    startTransition(async () => {
      try {
        await updateLdeSoferExtras(row.driver_id, patch);
        setEditField(null);
        router.refresh();
      } catch (err: any) {
        onError(err?.message || 'Eroare la salvare');
      }
    });
  }

  const rowStyle: React.CSSProperties = !row.hasAddress
    ? { backgroundColor: '#fef2f2' }
    : {};

  return (
    <tr style={rowStyle}>
      {/* Nume */}
      <td style={{ fontWeight: 600 }}>{row.full_name}</td>

      {/* Uzina */}
      <td>
        {editField === 'uzina' ? (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select
              autoFocus
              value={draftUzina}
              onChange={e => setDraftUzina(e.target.value)}
              style={{ fontSize: 13, padding: '2px 6px' }}
            >
              <option value="">— fără uzină —</option>
              {uzine.map(u => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isPending}
              onClick={() => save({ uzina_id: draftUzina || null })}
            >
              {isPending ? '...' : '✓'}
            </button>
            <button
              className="btn btn-outline"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => { setDraftUzina(row.uzina_id ?? ''); setEditField(null); }}
            >✕</button>
          </span>
        ) : (
          <span
            onClick={() => setEditField('uzina')}
            style={{ cursor: 'pointer', color: row.uzina_id ? undefined : '#dc2626' }}
          >
            {row.uzina_id ? (uzinaLabel.get(row.uzina_id) ?? row.uzina_id) : '— nu —'}
          </span>
        )}
      </td>

      {/* Adresa */}
      <td>
        {editField === 'address' ? (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              autoFocus
              value={draftAddress}
              onChange={e => setDraftAddress(e.target.value)}
              placeholder="ex: Edineț, str. Independenței 12"
              style={{ width: 260, fontSize: 13, padding: '2px 6px' }}
              onKeyDown={e => {
                if (e.key === 'Enter') save({ home_address: draftAddress });
                if (e.key === 'Escape') { setDraftAddress(row.home_address ?? ''); setEditField(null); }
              }}
            />
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isPending}
              onClick={() => save({ home_address: draftAddress })}
            >
              {isPending ? '...' : '✓'}
            </button>
            <button
              className="btn btn-outline"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => { setDraftAddress(row.home_address ?? ''); setEditField(null); }}
            >✕</button>
          </span>
        ) : row.hasAddress ? (
          <span onClick={() => setEditField('address')} style={{ cursor: 'pointer' }}>
            {row.home_address}
          </span>
        ) : (
          <span
            onClick={() => setEditField('address')}
            className="badge"
            style={{ cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}
          >
            Adresă lipsă
          </span>
        )}
      </td>

      {/* Cat. salariu */}
      <td>
        {editField === 'salary' ? (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select
              autoFocus
              value={draftSalary}
              onChange={e => setDraftSalary(e.target.value)}
              style={{ fontSize: 13, padding: '2px 6px' }}
            >
              <option value="">— fără —</option>
              {SALARY_OPTIONS.map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isPending}
              onClick={() =>
                save({
                  lde_salary_category: draftSalary
                    ? (Number(draftSalary) as LdeSalaryCategory)
                    : null,
                })
              }
            >
              {isPending ? '...' : '✓'}
            </button>
            <button
              className="btn btn-outline"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => { setDraftSalary(row.lde_salary_category?.toString() ?? ''); setEditField(null); }}
            >✕</button>
          </span>
        ) : (
          <span onClick={() => setEditField('salary')} style={{ cursor: 'pointer' }}>
            {row.lde_salary_category
              ? LDE_SALARY_CATEGORY_LABELS[row.lde_salary_category]
              : <span style={{ color: '#888' }}>— fără —</span>}
          </span>
        )}
      </td>

      {/* Parkare */}
      <td>
        {editField === 'parking' ? (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select
              autoFocus
              value={draftParking}
              onChange={e => setDraftParking(e.target.value as LdeParkingLocation)}
              style={{ fontSize: 13, padding: '2px 6px' }}
            >
              {PARKING_OPTIONS.map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isPending}
              onClick={() => save({ parking_location: draftParking })}
            >
              {isPending ? '...' : '✓'}
            </button>
            <button
              className="btn btn-outline"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => { setDraftParking(row.parking_location); setEditField(null); }}
            >✕</button>
          </span>
        ) : (
          <span onClick={() => setEditField('parking')} style={{ cursor: 'pointer' }}>
            {LDE_PARKING_LABELS[row.parking_location]}
          </span>
        )}
      </td>

      {/* Note */}
      <td>
        {editField === 'notes' ? (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              autoFocus
              value={draftNotes}
              onChange={e => setDraftNotes(e.target.value)}
              placeholder="note..."
              style={{ width: 200, fontSize: 13, padding: '2px 6px' }}
              onKeyDown={e => {
                if (e.key === 'Enter') save({ notes: draftNotes });
                if (e.key === 'Escape') { setDraftNotes(row.notes ?? ''); setEditField(null); }
              }}
            />
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isPending}
              onClick={() => save({ notes: draftNotes })}
            >
              {isPending ? '...' : '✓'}
            </button>
            <button
              className="btn btn-outline"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => { setDraftNotes(row.notes ?? ''); setEditField(null); }}
            >✕</button>
          </span>
        ) : row.notes ? (
          <span onClick={() => setEditField('notes')} style={{ cursor: 'pointer' }}>
            {row.notes}
          </span>
        ) : (
          <button
            onClick={() => setEditField('notes')}
            style={{ fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', color: '#666', textDecoration: 'underline' }}
          >
            + adaugă
          </button>
        )}
      </td>
    </tr>
  );
}
