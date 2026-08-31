'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adaugaPunct, dezactiveazaPunct, editeazaPunct, type Punct, type Rezultat } from './actions';

const gol = { name: '', country: '', lat: '', lng: '', radius_m: '500' };

export default function PuncteClient({ data }: { data: Punct[] }) {
  const router = useRouter();
  const [inCurs, pornesteTranzitia] = useTransition();
  const [form, setForm] = useState(gol);
  const [editId, setEditId] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState('');
  const [eroare, setEroare] = useState('');

  function ruleaza(actiune: () => Promise<Rezultat>, dupaSucces: () => void) {
    setMesaj(''); setEroare('');
    pornesteTranzitia(async () => {
      const r = await actiune();
      if ('error' in r) { setEroare(r.error); return; }
      setMesaj(r.mesaj); dupaSucces(); router.refresh();
    });
  }

  function numar(v: string): number | null {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }

  function salveaza() {
    const lat = numar(form.lat);
    const lng = numar(form.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) { setEroare('Coordonatele trebuie să fie numere'); return; }
    const p = {
      name: form.name,
      country: form.country || null,
      lat: lat as number | null,
      lng: lng as number | null,
      radius_m: Number(form.radius_m) || 500,
    };
    ruleaza(
      () => (editId ? editeazaPunct({ id: editId, ...p }) : adaugaPunct(p)),
      () => { setForm(gol); setEditId(null); },
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Puncte de încărcare / descărcare</h1>
        <p className="text-muted">
          Nomenclatorul folosit la planificarea curselor. Punctul fără coordonate rămâne valid,
          dar cursele lui nu primesc verificare GPS.
        </p>
      </div>

      {mesaj && <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>{mesaj}</div>}
      {eroare && <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>{eroare}</div>}

      <div className="card">
        <h3>{editId ? 'Editează punctul' : 'Punct nou'}</h3>
        <div className="grid-3">
          <div className="form-group">
            <label>Denumire</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex. Terminal Constanța" />
          </div>
          <div className="form-group">
            <label>Țara</label>
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="ex. România" />
          </div>
          <div className="form-group">
            <label>Raza (m)</label>
            <input value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} inputMode="numeric" />
          </div>
          <div className="form-group">
            <label>Latitudine</label>
            <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="44.1733" />
          </div>
          <div className="form-group">
            <label>Longitudine</label>
            <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="28.6383" />
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={salveaza} disabled={inCurs}>
            {editId ? 'Salvează' : 'Adaugă'}
          </button>
          {editId && (
            <button className="btn-outline" onClick={() => { setEditId(null); setForm(gol); }} disabled={inCurs}>
              Renunță
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Puncte active ({data.length})</h3>
        <div className="pivot-wrap">
          <table className="pivot-table">
            <thead>
              <tr><th>Denumire</th><th>Țara</th><th>Coordonate</th><th>Raza</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.country ?? '—'}</td>
                  <td>
                    {p.lat !== null && p.lng !== null
                      ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`
                      : <span className="badge badge-absent">fără coordonate</span>}
                  </td>
                  <td>{p.radius_m} m</td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="btn-outline"
                        disabled={inCurs}
                        onClick={() => {
                          setEditId(p.id);
                          setForm({
                            name: p.name, country: p.country ?? '',
                            lat: p.lat?.toString() ?? '', lng: p.lng?.toString() ?? '',
                            radius_m: String(p.radius_m),
                          });
                        }}
                      >
                        Editează
                      </button>
                      <button
                        className="btn-danger"
                        disabled={inCurs}
                        onClick={() => ruleaza(() => dezactiveazaPunct(p.id), () => {})}
                      >
                        Scoate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={5} className="pivot-empty">Niciun punct încă — adaugă primul mai sus.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
