'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CULPRITS, FALLBACK_CODE, type ComplaintType, type Culprit } from '@/lib/voice/complaint-types';
import { createComplaintType, updateComplaintType, toggleComplaintType } from './actions';

// Nomenclatorul tipurilor de reclamații. Ion, 02.09: «facem nomeclator de
// pretentii din partea la clienti pentru jalobe, tipul lor cine este vinovat».
//
// Coloana «Răspunde» e miezul ecranului: la starea mașinii sau la informația de
// pe site, șoferul e doar omul care conducea. Ion a spus-o pe listă: «10 nu e
// vina soferilor», «11 deja tot nu-i vina lor, dar tot am indicat».

const CULPRIT_LABEL: Record<Culprit, string> = {
  SOFER: 'Șoferul',
  COMPANIE: 'Compania',
  PARC: 'Parcul auto',
  SITE: 'Site-ul',
  NECLAR: 'De stabilit',
};

const CULPRIT_BADGE: Record<Culprit, string> = {
  SOFER: 'badge-absent',
  COMPANIE: 'badge-ok',
  PARC: 'badge-ok',
  SITE: 'badge-ok',
  NECLAR: 'badge-ok',
};

const GOL = { code: '', ord: 50, name_ro: '', name_ru: '', culprit: 'SOFER' as Culprit, note: '' };

export default function TipuriClient({ tipuri }: { tipuri: ComplaintType[] }) {
  const router = useRouter();
  const [nou, setNou] = useState(GOL);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [edit, setEdit] = useState(GOL);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function ruleaza(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ceva n-a mers.');
    } finally {
      setBusy(false);
    }
  }

  async function adauga(e: React.FormEvent) {
    e.preventDefault();
    await ruleaza(async () => {
      await createComplaintType(nou);
      setNou(GOL);
    });
  }

  function incepeEditarea(t: ComplaintType) {
    setEditCode(t.code);
    setEdit({ code: t.code, ord: t.ord, name_ro: t.name_ro, name_ru: t.name_ru, culprit: t.culprit, note: t.note ?? '' });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tipuri de reclamații</h1>
      </div>

      <div className="card mb-4">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Lista de aici e cea din care agentul vocal alege tipul, în timpul apelului.
          Coloana <b>Răspunde</b> spune cine se ocupă de lucrul reclamat — nu e verdict
          pe caz, e adresa la care pleacă dosarul. Un tip scos din uz se <b>stinge</b>,
          nu se șterge: dosarele vechi rămân legate de el.
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          O schimbare făcută aici ajunge la agent la următoarea rulare a controlerului,
          nu pe loc.
        </p>
      </div>

      <div className="card mb-4">
        <form onSubmit={adauga}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Cod</label>
              <input
                value={nou.code}
                onChange={(e) => setNou({ ...nou, code: e.target.value })}
                placeholder="ex: BAGAJ_REFUZAT"
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Ordine în listă</label>
              <input
                type="number"
                value={nou.ord}
                onChange={(e) => setNou({ ...nou, ord: Number(e.target.value) })}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Denumire (română)</label>
              <input
                value={nou.name_ro}
                onChange={(e) => setNou({ ...nou, name_ro: e.target.value })}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Denumire (rusă)</label>
              <input
                value={nou.name_ru}
                onChange={(e) => setNou({ ...nou, name_ru: e.target.value })}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Cine răspunde</label>
              <select
                value={nou.culprit}
                onChange={(e) => setNou({ ...nou, culprit: e.target.value as Culprit })}
              >
                {CULPRITS.map((c) => (
                  <option key={c} value={c}>{CULPRIT_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Notă (opțional)</label>
              <input
                value={nou.note}
                onChange={(e) => setNou({ ...nou, note: e.target.value })}
                placeholder="de ce e așa, ce se face"
              />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" type="submit" disabled={busy}>Adaugă tipul</button>
          </div>
        </form>
        {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>{error}</p>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th>Cod</th>
              <th>Denumire</th>
              <th>Răspunde</th>
              <th>Notă</th>
              <th>Stare</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {tipuri.map((t) => (
              editCode === t.code ? (
                <tr key={t.code}>
                  <td>
                    <input
                      type="number"
                      value={edit.ord}
                      onChange={(e) => setEdit({ ...edit, ord: Number(e.target.value) })}
                      style={{ width: 60, fontSize: 12 }}
                    />
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.code}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input
                        value={edit.name_ro}
                        onChange={(e) => setEdit({ ...edit, name_ro: e.target.value })}
                        style={{ fontSize: 12 }}
                      />
                      <input
                        value={edit.name_ru}
                        onChange={(e) => setEdit({ ...edit, name_ru: e.target.value })}
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  </td>
                  <td>
                    <select
                      value={edit.culprit}
                      onChange={(e) => setEdit({ ...edit, culprit: e.target.value as Culprit })}
                      style={{ fontSize: 12 }}
                    >
                      {CULPRITS.map((c) => (
                        <option key={c} value={c}>{CULPRIT_LABEL[c]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={edit.note}
                      onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                      style={{ fontSize: 12 }}
                    />
                  </td>
                  <td>—</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() => ruleaza(async () => {
                          await updateComplaintType(t.code, edit);
                          setEditCode(null);
                        })}
                      >
                        Salvează
                      </button>
                      <button className="btn btn-secondary" onClick={() => setEditCode(null)}>Renunță</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={t.code} style={{ opacity: t.active ? 1 : 0.5 }}>
                  <td style={{ color: 'var(--text-muted)' }}>{t.ord}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.code}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.name_ro}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.name_ru}</div>
                  </td>
                  <td>
                    <span className={`badge ${CULPRIT_BADGE[t.culprit]}`}>{CULPRIT_LABEL[t.culprit]}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 260 }}>{t.note ?? '—'}</td>
                  <td>
                    <span className={`badge ${t.active ? 'badge-ok' : 'badge-absent'}`}>
                      {t.active ? 'În listă' : 'Stins'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary" onClick={() => incepeEditarea(t)}>Modifică</button>
                      {t.code !== FALLBACK_CODE && (
                        <button
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => ruleaza(() => toggleComplaintType(t.code, !t.active))}
                        >
                          {t.active ? 'Stinge' : 'Repune'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
