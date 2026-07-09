'use client';

import { useState } from 'react';
import { savePart } from '../app/(dashboard)/piese/part-actions';

export interface PartFormValues {
  id?: number;
  group_id?: number | string;
  name_long?: string;
  manufacturer?: string;
  model?: string;
  article_code?: string;
  oem_code?: string;
  barcode?: string;
  unit?: string;
  is_for_sale?: boolean;
}

// Formular COMUN de piesă (adăugare + editare). Folosit în Nomenclator (tab „Piese") și inline în Prihod.
// Grupa (categoria) e obligatorie; stocul NU se setează aici — piesa nouă pornește cu stoc 0.
export default function PartForm({
  groups, initial, onSaved, onCancel,
}: {
  groups: { id: number; label: string }[];
  initial?: PartFormValues;
  onSaved: (p: { id: number; label: string }) => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<PartFormValues>({
    group_id: initial?.group_id ?? (groups[0]?.id ?? ''),
    name_long: initial?.name_long ?? '',
    manufacturer: initial?.manufacturer ?? '',
    model: initial?.model ?? '',
    article_code: initial?.article_code ?? '',
    oem_code: initial?.oem_code ?? '',
    barcode: initial?.barcode ?? '',
    unit: initial?.unit ?? 'buc',
    is_for_sale: initial?.is_for_sale ?? false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: keyof PartFormValues, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await savePart(f as Record<string, unknown>, initial?.id);
      onSaved(res);
    } catch (err: any) { setError(err?.message || 'Eroare la salvare'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
        <label>Grup (categorie) *</label>
        <select value={String(f.group_id ?? '')} onChange={(e) => set('group_id', e.target.value)} required>
          {groups.length === 0 && <option value="">— nicio grupă —</option>}
          {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
        <label>Denumire *</label>
        <input value={f.name_long ?? ''} onChange={(e) => set('name_long', e.target.value)} required placeholder="ex: Filtru ulei…" />
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
        <label>Producător</label>
        <input value={f.manufacturer ?? ''} onChange={(e) => set('manufacturer', e.target.value)} placeholder="ex: Mann" />
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 110 }}>
        <label>Model</label>
        <input value={f.model ?? ''} onChange={(e) => set('model', e.target.value)} />
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
        <label>Articul</label>
        <input value={f.article_code ?? ''} onChange={(e) => set('article_code', e.target.value)} placeholder="ex: W71280" />
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
        <label>Cod OEM</label>
        <input value={f.oem_code ?? ''} onChange={(e) => set('oem_code', e.target.value)} />
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
        <label>Cod de bare</label>
        <input value={f.barcode ?? ''} onChange={(e) => set('barcode', e.target.value)} placeholder="scanează / tastează" />
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 80 }}>
        <label>Unitate</label>
        <input value={f.unit ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="buc" />
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!f.is_for_sale} onChange={(e) => set('is_for_sale', e.target.checked)} style={{ width: 'auto' }} />
          De vânzare
        </label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Se salvează…' : (initial?.id ? 'Salvează' : 'Adaugă piesa')}</button>
      {onCancel && <button type="button" className="btn btn-outline" onClick={onCancel} disabled={loading}>Anulează</button>}
      {error && <p style={{ color: 'var(--danger)', fontSize: 14, margin: '4px 0 0', flexBasis: '100%' }}>{error}</p>}
    </form>
  );
}
