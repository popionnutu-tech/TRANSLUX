'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LdeUzina } from '@translux/db';
import { LDE_SHIFT_PATTERN_LABELS } from '@translux/db';
import { createUzina, updateUzina, toggleUzina, deleteUzina, type UzinaInput } from './actions';

type PatternKey = keyof typeof LDE_SHIFT_PATTERN_LABELS;
const PATTERNS = Object.keys(LDE_SHIFT_PATTERN_LABELS) as PatternKey[];

const EMPTY_FORM: UzinaInput = {
  id: '',
  display_name: '',
  city: '',
  shift_pattern: 'S1_S2_FIXED',
  shift1_time: '',
  shift2_time: '',
  shift3_time: '',
  works_saturday: false,
  works_sunday: false,
  notes: '',
};

export default function UzineClient({ initialUzine }: { initialUzine: LdeUzina[] }) {
  const [form, setForm] = useState<UzinaInput>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function patchForm(p: Partial<UzinaInput>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createUzina(form);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      await toggleUzina(id, !active);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Sigur vrei să ștergi această uzină?')) return;
    try {
      await deleteUzina(id);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Uzine</h1>
      </div>

      <div className="card mb-4">
        <form onSubmit={handleCreate} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
              <label>ID (MAJUSCULE_UNDERSCORE)</label>
              <input
                value={form.id}
                onChange={(e) => patchForm({ id: e.target.value.toUpperCase() })}
                placeholder="ex: DRAXELMAIER_BALTI"
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
              <label>Nume afișat</label>
              <input
                value={form.display_name}
                onChange={(e) => patchForm({ display_name: e.target.value })}
                placeholder="ex: Draxelmaier-Bălți"
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
              <label>Oraș</label>
              <input
                value={form.city}
                onChange={(e) => patchForm({ city: e.target.value })}
                placeholder="ex: Bălți"
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
              <label>Pattern schimburi</label>
              <select
                value={form.shift_pattern}
                onChange={(e) => patchForm({ shift_pattern: e.target.value as PatternKey })}
              >
                {PATTERNS.map((p) => (
                  <option key={p} value={p}>{LDE_SHIFT_PATTERN_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
              <label>Schimb 1</label>
              <input
                value={form.shift1_time ?? ''}
                onChange={(e) => patchForm({ shift1_time: e.target.value })}
                placeholder="07:00-15:30"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
              <label>Schimb 2</label>
              <input
                value={form.shift2_time ?? ''}
                onChange={(e) => patchForm({ shift2_time: e.target.value })}
                placeholder="15:30-00:00"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
              <label>Schimb 3</label>
              <input
                value={form.shift3_time ?? ''}
                onChange={(e) => patchForm({ shift3_time: e.target.value })}
                placeholder="23:00-06:00"
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={form.works_saturday}
                onChange={(e) => patchForm({ works_saturday: e.target.checked })}
              />
              Sâmbătă
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={form.works_sunday}
                onChange={(e) => patchForm({ works_sunday: e.target.checked })}
              />
              Duminică
            </label>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Note</label>
            <input
              value={form.notes ?? ''}
              onChange={(e) => patchForm({ notes: e.target.value })}
              placeholder="ex: la nevoie sâmbăta"
            />
          </div>

          <div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Se salvează...' : 'Adaugă uzină'}
            </button>
          </div>
        </form>
        {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>{error}</p>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nume</th>
              <th>Oraș</th>
              <th>Pattern</th>
              <th>S1</th>
              <th>S2</th>
              <th>S3</th>
              <th>Sâ/Du</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialUzine.map((u) => (
              <UzinaRow
                key={u.id}
                uzina={u}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
            {initialUzine.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-muted">
                  Nu există uzine.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UzinaRow({
  uzina,
  onToggle,
  onDelete,
}: {
  uzina: LdeUzina;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<UzinaInput>(toInput(uzina));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function start() {
    setDraft(toInput(uzina));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await updateUzina(uzina.id, draft);
      setEditing(false);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <tr>
        <td>{uzina.id}</td>
        <td>
          <input
            value={draft.display_name}
            onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
            style={{ width: 160, fontSize: 13, padding: '2px 6px' }}
          />
        </td>
        <td>
          <input
            value={draft.city}
            onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            style={{ width: 100, fontSize: 13, padding: '2px 6px' }}
          />
        </td>
        <td>
          <select
            value={draft.shift_pattern}
            onChange={(e) => setDraft({ ...draft, shift_pattern: e.target.value as PatternKey })}
            style={{ fontSize: 13, padding: '2px 6px' }}
          >
            {PATTERNS.map((p) => (
              <option key={p} value={p}>{LDE_SHIFT_PATTERN_LABELS[p]}</option>
            ))}
          </select>
        </td>
        <td>
          <input
            value={draft.shift1_time ?? ''}
            onChange={(e) => setDraft({ ...draft, shift1_time: e.target.value })}
            placeholder="07:00-15:30"
            style={{ width: 95, fontSize: 13, padding: '2px 6px' }}
          />
        </td>
        <td>
          <input
            value={draft.shift2_time ?? ''}
            onChange={(e) => setDraft({ ...draft, shift2_time: e.target.value })}
            placeholder="15:30-00:00"
            style={{ width: 95, fontSize: 13, padding: '2px 6px' }}
          />
        </td>
        <td>
          <input
            value={draft.shift3_time ?? ''}
            onChange={(e) => setDraft({ ...draft, shift3_time: e.target.value })}
            placeholder="23:00-06:00"
            style={{ width: 95, fontSize: 13, padding: '2px 6px' }}
          />
        </td>
        <td>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={draft.works_saturday}
              onChange={(e) => setDraft({ ...draft, works_saturday: e.target.checked })}
            />
            Sâ
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={draft.works_sunday}
              onChange={(e) => setDraft({ ...draft, works_sunday: e.target.checked })}
            />
            Du
          </label>
        </td>
        <td>
          <span className={`badge ${uzina.active ? 'badge-ok' : 'badge-absent'}`}>
            {uzina.active ? 'Activ' : 'Inactiv'}
          </span>
        </td>
        <td>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn btn-primary" style={{ fontSize: 12 }}>
              {saving ? '...' : 'Salvează'}
            </button>
            <button onClick={() => setEditing(false)} className="btn btn-outline" style={{ fontSize: 12 }}>
              Anulează
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ opacity: uzina.active ? 1 : 0.5 }}>
      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{uzina.id}</td>
      <td onClick={start} style={{ cursor: 'pointer', fontWeight: 600 }}>{uzina.display_name}</td>
      <td>{uzina.city}</td>
      <td>{LDE_SHIFT_PATTERN_LABELS[uzina.shift_pattern]}</td>
      <td>{uzina.shift1_time ?? '—'}</td>
      <td>{uzina.shift2_time ?? '—'}</td>
      <td>{uzina.shift3_time ?? '—'}</td>
      <td style={{ fontSize: 12 }}>
        {uzina.works_saturday ? 'Sâ' : '—'}/{uzina.works_sunday ? 'Du' : '—'}
      </td>
      <td>
        <span className={`badge ${uzina.active ? 'badge-ok' : 'badge-absent'}`}>
          {uzina.active ? 'Activ' : 'Inactiv'}
        </span>
      </td>
      <td>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={start}>Editează</button>
          <button className="btn btn-outline" onClick={() => onToggle(uzina.id, uzina.active)}>
            {uzina.active ? 'Dezactivează' : 'Activează'}
          </button>
          <button className="btn btn-danger" onClick={() => onDelete(uzina.id)}>Șterge</button>
        </div>
      </td>
    </tr>
  );
}

function toInput(u: LdeUzina): UzinaInput {
  return {
    id: u.id,
    display_name: u.display_name,
    city: u.city,
    shift_pattern: u.shift_pattern,
    shift1_time: u.shift1_time ?? '',
    shift2_time: u.shift2_time ?? '',
    shift3_time: u.shift3_time ?? '',
    works_saturday: u.works_saturday,
    works_sunday: u.works_sunday,
    notes: u.notes ?? '',
  };
}
