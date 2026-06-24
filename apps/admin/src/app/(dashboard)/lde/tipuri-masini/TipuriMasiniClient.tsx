'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X, Trash2 } from 'lucide-react';
import type { LdeVehicleType, LdeVehicleCategory } from '@translux/db';
import { LDE_VEHICLE_CATEGORY_LABELS } from '@translux/db';
import {
  createVehicleType,
  updateVehicleType,
  deleteVehicleType,
} from './actions';

const CATEGORY_OPTIONS = Object.entries(LDE_VEHICLE_CATEGORY_LABELS) as [LdeVehicleCategory, string][];

type FormState = {
  id: string;
  display_name: string;
  category: LdeVehicleCategory;
  norm_l_per_100km: string;
  norm_l_per_100km_loaded: string;
  passenger_seats: string;
};

const EMPTY_FORM: FormState = {
  id: '',
  display_name: '',
  category: 'microbuz',
  norm_l_per_100km: '',
  norm_l_per_100km_loaded: '',
  passenger_seats: '',
};

export default function TipuriMasiniClient({ initialTypes }: { initialTypes: LdeVehicleType[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(
    () => [...initialTypes].sort((a, b) => a.display_name.localeCompare(b.display_name, 'ro')),
    [initialTypes]
  );

  const isCamion = form.category === 'camion_marfa';

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const id = form.id.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(id)) {
      setError('ID invalid: doar litere mari, cifre și underscore (ex: SPRINTER_312)');
      return;
    }
    if (!form.display_name.trim()) {
      setError('Denumirea este obligatorie');
      return;
    }
    const norm = parseFloat(form.norm_l_per_100km);
    if (!Number.isFinite(norm) || norm <= 0) {
      setError('Norma l/100km trebuie să fie un număr pozitiv');
      return;
    }

    const payload: LdeVehicleType = {
      id,
      display_name: form.display_name.trim(),
      category: form.category,
      norm_l_per_100km: norm,
      norm_l_per_100km_loaded: isCamion ? parseFloat(form.norm_l_per_100km_loaded) : null,
      passenger_seats: isCamion ? null : parseInt(form.passenger_seats, 10),
      notes: null,
      created_at: new Date().toISOString(),
    };

    if (isCamion && (!Number.isFinite(payload.norm_l_per_100km_loaded as number) || (payload.norm_l_per_100km_loaded as number) <= 0)) {
      setError('Pentru camion, norma încărcat trebuie să fie pozitivă');
      return;
    }
    if (!isCamion && (!Number.isFinite(payload.passenger_seats as number) || (payload.passenger_seats as number) <= 0)) {
      setError('Numărul de locuri este obligatoriu și pozitiv');
      return;
    }

    setSaving(true);
    try {
      await createVehicleType(payload);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Sigur ștergeți tipul "${id}"?`)) return;
    try {
      await deleteVehicleType(id);
      router.refresh();
    } catch (err: any) {
      alert(err?.message || 'Eroare la ștergere');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tipuri mașini LDE</h1>
      </div>

      <div className="card mb-4">
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>ID (ALL_CAPS)</label>
            <input
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value.toUpperCase() })}
              placeholder="ex: SPRINTER_312"
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Denumire</label>
            <input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="ex: Sprinter 312"
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Categorie</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as LdeVehicleCategory })}
            >
              {CATEGORY_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
            <label>Normă l/100km</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={form.norm_l_per_100km}
              onChange={(e) => setForm({ ...form, norm_l_per_100km: e.target.value })}
              placeholder="ex: 12.5"
              required
            />
          </div>
          {isCamion ? (
            <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
              <label>Normă încărcat l/100km</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={form.norm_l_per_100km_loaded}
                onChange={(e) => setForm({ ...form, norm_l_per_100km_loaded: e.target.value })}
                placeholder="ex: 28"
                required
              />
            </div>
          ) : (
            <div className="form-group" style={{ marginBottom: 0, minWidth: 110 }}>
              <label>Locuri</label>
              <input
                type="number"
                min="1"
                value={form.passenger_seats}
                onChange={(e) => setForm({ ...form, passenger_seats: e.target.value })}
                placeholder="ex: 19"
                required
              />
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Se salvează...' : 'Adaugă'}
          </button>
        </form>
        {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>{error}</p>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Denumire</th>
              <th>Categorie</th>
              <th>l/100km</th>
              <th>l/100km încărcat</th>
              <th>Locuri</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <TipRow key={t.id} type={t} onDelete={handleDelete} />
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted">
                  Nu există tipuri de mașini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TipRow({ type, onDelete }: { type: LdeVehicleType; onDelete: (id: string) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    display_name: type.display_name,
    category: type.category,
    norm_l_per_100km: String(type.norm_l_per_100km ?? ''),
    norm_l_per_100km_loaded: type.norm_l_per_100km_loaded != null ? String(type.norm_l_per_100km_loaded) : '',
    passenger_seats: type.passenger_seats != null ? String(type.passenger_seats) : '',
  });

  function startEdit() {
    setDraft({
      display_name: type.display_name,
      category: type.category,
      norm_l_per_100km: String(type.norm_l_per_100km ?? ''),
      norm_l_per_100km_loaded: type.norm_l_per_100km_loaded != null ? String(type.norm_l_per_100km_loaded) : '',
      passenger_seats: type.passenger_seats != null ? String(type.passenger_seats) : '',
    });
    setEditing(true);
  }

  async function handleSave() {
    const isCamion = draft.category === 'camion_marfa';
    const norm = parseFloat(draft.norm_l_per_100km);
    if (!Number.isFinite(norm) || norm <= 0) {
      alert('Norma l/100km trebuie să fie un număr pozitiv');
      return;
    }
    const patch: Partial<LdeVehicleType> = {
      display_name: draft.display_name.trim(),
      category: draft.category,
      norm_l_per_100km: norm,
      norm_l_per_100km_loaded: isCamion ? parseFloat(draft.norm_l_per_100km_loaded) : null,
      passenger_seats: isCamion ? null : parseInt(draft.passenger_seats, 10),
    };
    setSaving(true);
    try {
      await updateVehicleType(type.id, patch);
      setEditing(false);
      router.refresh();
    } catch (err: any) {
      alert(err?.message || 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  }

  const isCamion = draft.category === 'camion_marfa';

  if (!editing) {
    return (
      <tr>
        <td><code>{type.id}</code></td>
        <td>{type.display_name}</td>
        <td>{LDE_VEHICLE_CATEGORY_LABELS[type.category]}</td>
        <td>{type.norm_l_per_100km}</td>
        <td>{type.norm_l_per_100km_loaded ?? '—'}</td>
        <td>{type.passenger_seats ?? '—'}</td>
        <td>
          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={startEdit} title="Editează">
              <Pencil size={14} />
            </button>
            <button className="btn btn-danger" onClick={() => onDelete(type.id)} title="Șterge">
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td><code>{type.id}</code></td>
      <td>
        <input
          value={draft.display_name}
          onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
          style={{ width: 140, fontSize: 13, padding: '2px 6px' }}
        />
      </td>
      <td>
        <select
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value as LdeVehicleCategory })}
          style={{ fontSize: 13, padding: '2px 6px' }}
        >
          {CATEGORY_OPTIONS.map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="number"
          step="0.1"
          min="0"
          value={draft.norm_l_per_100km}
          onChange={(e) => setDraft({ ...draft, norm_l_per_100km: e.target.value })}
          style={{ width: 70, fontSize: 13, padding: '2px 6px' }}
        />
      </td>
      <td>
        <input
          type="number"
          step="0.1"
          min="0"
          value={draft.norm_l_per_100km_loaded}
          onChange={(e) => setDraft({ ...draft, norm_l_per_100km_loaded: e.target.value })}
          disabled={!isCamion}
          placeholder={isCamion ? '' : '—'}
          style={{ width: 80, fontSize: 13, padding: '2px 6px' }}
        />
      </td>
      <td>
        <input
          type="number"
          min="1"
          value={draft.passenger_seats}
          onChange={(e) => setDraft({ ...draft, passenger_seats: e.target.value })}
          disabled={isCamion}
          placeholder={isCamion ? '—' : ''}
          style={{ width: 70, fontSize: 13, padding: '2px 6px' }}
        />
      </td>
      <td>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} title="Salvează">
            {saving ? '...' : <Check size={14} />}
          </button>
          <button className="btn btn-outline" onClick={() => setEditing(false)} title="Anulează">
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}
