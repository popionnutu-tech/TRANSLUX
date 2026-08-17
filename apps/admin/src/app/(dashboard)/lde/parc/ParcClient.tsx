'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeazaPlaca } from '@/lib/lde/parc';
import {
  adaugaMasina, adaugaSofer, leagaMasinaSofer,
  type ParcData,
} from './actions';

const SHIFTS = [1, 2, 3];

export default function ParcClient({ data }: { data: ParcData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mesaj, setMesaj] = useState('');
  const [eroare, setEroare] = useState('');

  // formular mașină
  const [placa, setPlaca] = useState('');
  const [uzinaMasina, setUzinaMasina] = useState('');
  // formular șofer
  const [nume, setNume] = useState('');
  const [telefon, setTelefon] = useState('');
  const [uzinaSofer, setUzinaSofer] = useState('');
  // formular legătură
  const [legMasina, setLegMasina] = useState('');
  const [legSofer, setLegSofer] = useState('');
  const [legShift, setLegShift] = useState('');

  const uzinaLabel = useMemo(() => {
    const m = new Map(data.uzine.map(u => [u.id, u.label]));
    return (id: string) => m.get(id) ?? id;
  }, [data.uzine]);

  const faraNorma = useMemo(() => data.masini.filter(m => !m.areNorma), [data.masini]);
  // motorul de salarii ia doar șoferii cu categoria 1–5 (lde/salarii/actions.ts):
  // fără ea omul lipsește din stat, și asta se vede abia la sfârșit de lună
  const faraCategorie = useMemo(() => data.soferi.filter(s => s.categorie == null), [data.soferi]);
  // atribuirea trăiește în două locuri; dacă se despart, în grafic sau la salarii lipsește cineva
  const atribuireIncompleta = useMemo(
    () => data.soferi.filter(s => (s.uzinaExtras && !s.uzine.includes(s.uzinaExtras)) || (!s.uzinaExtras && s.uzine.length > 0)),
    [data.soferi],
  );

  const placaPreview = normalizeazaPlaca(placa);

  function ruleaza(actiune: () => Promise<{ ok: true; mesaj: string } | { error: string }>, dupaSucces: () => void) {
    setMesaj('');
    setEroare('');
    start(async () => {
      const r = await actiune();
      if ('error' in r) { setEroare(r.error); return; }
      setMesaj(r.mesaj);
      dupaSucces();
      router.refresh();
    });
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>Parc uzine</h1>
      </div>

      {mesaj && <div className="card mb-4" style={{ borderLeft: '3px solid var(--success)' }}>{mesaj}</div>}
      {eroare && <div className="card mb-4" style={{ borderLeft: '3px solid var(--danger)', color: 'var(--danger)' }}>{eroare}</div>}

      {/* ── Adăugare ── */}
      <div className="grid-3 mb-4">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Mașină nouă</h2>
          <div className="form-group">
            <label>Număr</label>
            <input value={placa} onChange={e => setPlaca(e.target.value)} placeholder="ex: 029 BRAS" />
            {placaPreview && placaPreview !== placa.trim() && (
              <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>Se salvează ca <b>{placaPreview}</b></p>
            )}
          </div>
          <div className="form-group">
            <label>Uzina</label>
            <select value={uzinaMasina} onChange={e => setUzinaMasina(e.target.value)}>
              <option value="">— alege —</option>
              {data.uzine.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
          <button
            className="btn btn-primary"
            disabled={pending || !placa.trim() || !uzinaMasina}
            onClick={() => ruleaza(() => adaugaMasina(placa, uzinaMasina), () => { setPlaca(''); setUzinaMasina(''); })}
          >
            {pending ? 'Se salvează...' : 'Adaugă mașina'}
          </button>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Șofer nou</h2>
          <div className="form-group">
            <label>Nume complet</label>
            <input value={nume} onChange={e => setNume(e.target.value)} placeholder="ex: Struna Valeriu" />
          </div>
          <div className="form-group">
            <label>Telefon <span className="text-muted">(opțional)</span></label>
            <input value={telefon} onChange={e => setTelefon(e.target.value)} placeholder="ex: 069123456" />
            {/* fără telefon rămâne bun doar pe uzine: pe cursele din orar e respins
                (lib/atribuiri/core.ts), fiindcă site-ul public ascunde cursa fără număr */}
            <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Fără telefon șoferul poate lucra doar pe uzine, nu și pe cursele din orar.
            </p>
          </div>
          <div className="form-group">
            <label>Uzina</label>
            <select value={uzinaSofer} onChange={e => setUzinaSofer(e.target.value)}>
              <option value="">— alege —</option>
              {data.uzine.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
          <button
            className="btn btn-primary"
            disabled={pending || nume.trim().split(/\s+/).length < 2 || !uzinaSofer}
            onClick={() => ruleaza(() => adaugaSofer(nume, telefon, uzinaSofer), () => { setNume(''); setTelefon(''); setUzinaSofer(''); })}
          >
            {pending ? 'Se salvează...' : 'Adaugă șoferul'}
          </button>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Leagă mașina cu șoferul</h2>
          <div className="form-group">
            <label>Mașina</label>
            <select value={legMasina} onChange={e => setLegMasina(e.target.value)}>
              <option value="">— alege —</option>
              {/* arătăm uzina/«camioane» în listă: legătura decide de pe ce mașină se
                  iau kilometrii GPS pentru salariu, deci o alegere greșită mută banii */}
              {data.masini.map(m => (
                <option key={m.id} value={m.id}>
                  {m.plate}{m.uzine.length ? ` — ${m.uzine.map(uzinaLabel).join(', ')}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Șoferul</label>
            <select value={legSofer} onChange={e => setLegSofer(e.target.value)}>
              <option value="">— alege —</option>
              {data.soferi.map(s => <option key={s.id} value={s.id}>{s.nume}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Schimb <span className="text-muted">(opțional)</span></label>
            <select value={legShift} onChange={e => setLegShift(e.target.value)}>
              <option value="">Fără schimb</option>
              {SHIFTS.map(s => <option key={s} value={s}>Schimbul {s}</option>)}
            </select>
          </div>
          <button
            className="btn btn-primary"
            disabled={pending || !legMasina || !legSofer}
            onClick={() => ruleaza(
              () => leagaMasinaSofer(legMasina, legSofer, legShift ? Number(legShift) : null),
              () => { setLegMasina(''); setLegSofer(''); setLegShift(''); },
            )}
          >
            {pending ? 'Se salvează...' : 'Leagă'}
          </button>
        </div>
      </div>

      {faraNorma.length > 0 && (
        <div className="card mb-4" style={{ borderLeft: '3px solid var(--warning)' }}>
          <b>Mașini fără normă de consum ({faraNorma.length})</b> — până le pune un admin norma, nu li se calculează motorina:{' '}
          {faraNorma.map(m => m.plate).join(', ')}
        </div>
      )}

      {faraCategorie.length > 0 && (
        <div className="card mb-4" style={{ borderLeft: '3px solid var(--danger)' }}>
          <b>Șoferi fără categorie de salariu ({faraCategorie.length})</b> — până le pune un admin categoria 1–5,
          NU intră în statul de salarii: {faraCategorie.map(s => s.nume).join(', ')}
        </div>
      )}

      {atribuireIncompleta.length > 0 && (
        <div className="card mb-4" style={{ borderLeft: '3px solid var(--warning)' }}>
          <b>Șoferi cu atribuire incompletă ({atribuireIncompleta.length})</b> — uzina e scrisă doar pe jumătate,
          deci lipsesc ori din grafic, ori de la salarii: {atribuireIncompleta.map(s => s.nume).join(', ')}
        </div>
      )}

      {/* ── Liste ── */}
      <div className="grid-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Mașini LDE ({data.masini.length})</h2>
          <table className="pivot-table">
            <thead><tr><th>Număr</th><th>Uzine</th><th>Normă</th></tr></thead>
            <tbody>
              {data.masini.map(m => (
                <tr key={m.id}>
                  <td>{m.plate}</td>
                  <td>{m.uzine.map(uzinaLabel).join(', ') || <span className="text-muted">—</span>}</td>
                  <td>{m.areNorma ? <span className="badge badge-ok">da</span> : <span className="badge badge-absent">nu</span>}</td>
                </tr>
              ))}
              {!data.masini.length && <tr><td colSpan={3} className="text-center text-muted">Nu există date.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Șoferi LDE ({data.soferi.length})</h2>
          <table className="pivot-table">
            <thead><tr><th>Nume</th><th>Telefon</th><th>Uzine</th></tr></thead>
            <tbody>
              {data.soferi.map(s => (
                <tr key={s.id}>
                  <td>{s.nume}</td>
                  <td>{s.telefon || <span className="text-muted">—</span>}</td>
                  <td>{s.uzine.map(uzinaLabel).join(', ') || <span className="text-muted">—</span>}</td>
                </tr>
              ))}
              {!data.soferi.length && <tr><td colSpan={3} className="text-center text-muted">Nu există date.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-4">
        <h2 style={{ marginTop: 0 }}>Legături active ({data.legaturi.length})</h2>
        <table className="pivot-table">
          <thead><tr><th>Mașina</th><th>Șoferul</th><th>Schimb</th><th>Din</th></tr></thead>
          <tbody>
            {data.legaturi.map(l => (
              <tr key={l.id}>
                <td>{l.masina}</td>
                <td>{l.sofer}</td>
                <td>{l.shift ?? <span className="text-muted">—</span>}</td>
                <td>{l.dinData}</td>
              </tr>
            ))}
            {!data.legaturi.length && <tr><td colSpan={4} className="text-center text-muted">Nu există date.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="text-muted" style={{ fontSize: 13, marginTop: 16 }}>
        Ștergerea și corectarea se fac de un admin — aici doar se adaugă.
      </p>
    </div>
  );
}
