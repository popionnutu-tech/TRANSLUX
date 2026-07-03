'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createNomenclator, updateNomenclator } from './actions';

type Field = { key: string; label: string; type?: 'text' | 'number' | 'select'; options?: { value: string; label: string }[]; required?: boolean; placeholder?: string };
type SectionCfg = { key: string; title: string; fields: Field[] };

const SECTIONS: SectionCfg[] = [
  { key: 'warehouses', title: 'Depozite', fields: [
    { key: 'code', label: 'Cod', required: true, placeholder: 'ex: WH-CENTRAL' },
    { key: 'name', label: 'Denumire', required: true },
    { key: 'kind', label: 'Tip', type: 'select', options: [{ value: 'INTERNAL', label: 'Intern (depozit)' }, { value: 'SHOP', label: 'Magazin (vânzare)' }] },
  ] },
  { key: 'groups', title: 'Grupe de piese', fields: [
    { key: 'name_ro', label: 'Denumire (RO)', required: true },
    { key: 'name_ru', label: 'Denumire (RU)' },
    { key: 'markup_pct', label: 'Adaos %', type: 'number' },
    { key: 'norm_km', label: 'Normă km', type: 'number' },
  ] },
  { key: 'suppliers', title: 'Furnizori', fields: [
    { key: 'name', label: 'Denumire', required: true },
    { key: 'idno', label: 'IDNO' },
    { key: 'contact', label: 'Contact' },
  ] },
  { key: 'clients', title: 'Clienți', fields: [
    { key: 'name', label: 'Denumire', required: true },
    { key: 'idno', label: 'IDNO' },
    { key: 'bank', label: 'Bancă' },
    { key: 'address', label: 'Adresă' },
  ] },
  { key: 'mechanics', title: 'Mecanici', fields: [
    { key: 'name', label: 'Nume', required: true },
  ] },
  { key: 'reasons', title: 'Motive defecțiune', fields: [
    { key: 'name', label: 'Denumire', required: true },
    { key: 'category', label: 'Categorie' },
  ] },
];

export default function NomenclatorClient({ sections, data }: { sections: string[]; data: Record<string, any[]> }) {
  const visible = SECTIONS.filter((s) => sections.includes(s.key));
  const [active, setActive] = useState(visible[0]?.key || '');
  const cfg = visible.find((s) => s.key === active);

  if (!cfg) return <div className="card"><div className="empty">Niciun nomenclator disponibil pentru rolul tău.</div></div>;

  return (
    <>
      <div className="pill-row" style={{ marginBottom: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {visible.map((s) => (
          <button key={s.key} className={`btn${active === s.key ? ' btn-primary' : ''}`} style={{ padding: '8px 14px' }} onClick={() => setActive(s.key)}>{s.title}</button>
        ))}
      </div>
      <Section key={cfg.key} cfg={cfg} rows={data[cfg.key] || []} />
    </>
  );
}

function blankForm(cfg: SectionCfg): Record<string, string> {
  const o: Record<string, string> = {};
  for (const f of cfg.fields) o[f.key] = f.type === 'select' ? (f.options?.[0]?.value || '') : '';
  return o;
}

function Section({ cfg, rows }: { cfg: SectionCfg; rows: any[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>(() => blankForm(cfg));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await createNomenclator(cfg.key, form);
      setForm(blankForm(cfg));
      router.refresh();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  function startEdit(row: any) {
    const o: Record<string, string> = {};
    for (const f of cfg.fields) o[f.key] = row[f.key] == null ? '' : String(row[f.key]);
    setEditForm(o); setEditId(row.id); setError('');
  }

  async function handleUpdate() {
    if (editId == null) return;
    setLoading(true); setError('');
    try {
      await updateNomenclator(cfg.key, editId, editForm);
      setEditId(null);
      router.refresh();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  return (
    <div className="card">
      <h2>{cfg.title}</h2>
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 14 }}>
        {cfg.fields.map((f) => (
          <div className="form-group" key={f.key} style={{ marginBottom: 0, minWidth: 140 }}>
            <label>{f.label}{f.required ? ' *' : ''}</label>
            <FieldInput field={f} value={form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} />
          </div>
        ))}
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Se salvează…' : 'Adaugă'}</button>
      </form>
      {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 0 }}>{error}</p>}

      <table>
        <thead><tr>{cfg.fields.map((f) => <th key={f.key}>{f.label}</th>)}<th>Acțiuni</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {cfg.fields.map((f) => (
                <td key={f.key}>
                  {editId === row.id
                    ? <FieldInput field={f} value={editForm[f.key]} onChange={(v) => setEditForm({ ...editForm, [f.key]: v })} />
                    : formatCell(f, row[f.key])}
                </td>
              ))}
              <td>
                {editId === row.id ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary" disabled={loading} onClick={handleUpdate}>✓</button>
                    <button className="btn btn-outline" onClick={() => { setEditId(null); setError(''); }}>✕</button>
                  </span>
                ) : (
                  <button className="btn btn-outline" onClick={() => startEdit(row)}>Editează</button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={cfg.fields.length + 1} className="muted">Nimic încă.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  if (field.type === 'select') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      type={field.type === 'number' ? 'number' : 'text'}
      value={value}
      placeholder={field.placeholder || ''}
      required={field.required}
      step={field.type === 'number' ? 'any' : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function formatCell(field: Field, v: any) {
  if (v == null || v === '') return <span className="muted">—</span>;
  if (field.key === 'kind') return v === 'SHOP' ? 'Magazin' : 'Intern';
  return String(v);
}
