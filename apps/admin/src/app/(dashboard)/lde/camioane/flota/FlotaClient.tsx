'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  adaugaCamionNou, adaugaSoferCamion, adaugaSoferNou, atribuieSofer, scoateSoferCamion,
  type CamionFlota, type Candidat, type Rezultat, type SoferCamion, type TipCamion,
} from './actions';
import { seteazaTipCamion } from '../planificare/actions';
import { normalizeazaPlaca } from '@/lib/lde/parc';

type Props = { camioane: CamionFlota[]; soferi: SoferCamion[]; candidati: Candidat[] };

export default function FlotaClient({ camioane, soferi, candidati }: Props) {
  const router = useRouter();
  const [inCurs, pornesteTranzitia] = useTransition();
  const [mesaj, setMesaj] = useState('');
  const [eroare, setEroare] = useState('');
  const [candidatAles, setCandidatAles] = useState('');
  // Ion, 10.09: dispecerul adaugă și înregistrări noi, nu doar alege din ce există.
  const [placaNoua, setPlacaNoua] = useState('');
  const [tipNou, setTipNou] = useState<TipCamion | ''>('');
  const [numeNou, setNumeNou] = useState('');
  const [telefonNou, setTelefonNou] = useState('');
  const placaPreview = normalizeazaPlaca(placaNoua);

  function ruleaza(actiune: () => Promise<Rezultat>) {
    setMesaj(''); setEroare('');
    pornesteTranzitia(async () => {
      const r = await actiune();
      if ('error' in r) { setEroare(r.error); return; }
      setMesaj(r.mesaj);
      router.refresh();
    });
  }

  /** Schimbarea șoferului se confirmă: un select se mișcă și din rotița mouse-ului. */
  function schimbaSofer(cam: CamionFlota, idNou: string) {
    const numeNou = idNou ? soferi.find((s) => s.id === idNou)?.name ?? 'șoferul ales' : null;
    const intrebare = numeNou
      ? `Pui pe ${cam.plate} șoferul ${numeNou}?`
      : `Scoți șoferul de pe ${cam.plate}? Camionul fără șofer nu mai apare în dispecerat.`;
    if (!window.confirm(intrebare)) { router.refresh(); return; }
    ruleaza(() => atribuieSofer(cam.id, idNou || null));
  }

  // Ion, 01.09: lista se împarte în active și inactive. «Inactiv» = mașina e a
  // noastră, dar n-are șofer — ea nu lucrează și nu apare în dispecerat.
  const active = camioane.filter((c) => c.driverId);
  const inactive = camioane.filter((c) => !c.driverId);
  const liberi = soferi.filter((s) => !s.peCamion).length;

  function tabelCamioane(lista: CamionFlota[], gol: string) {
    return (
      <div className="pivot-wrap">
        <table className="pivot-table">
          <thead>
            <tr><th>Plăcuță</th><th>Tip</th><th>Șofer</th></tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.plate}</strong></td>
                <td>
                  <select
                    value={c.fleetType ?? ''}
                    disabled={inCurs}
                    onChange={(e) => {
                      const v = e.target.value as 'cisterna' | 'zernovoz' | '';
                      if (!v) return;
                      ruleaza(() => seteazaTipCamion(c.id, v));
                    }}
                  >
                    <option value="">— tip —</option>
                    <option value="cisterna">cisternă</option>
                    <option value="zernovoz">zernovoz</option>
                  </select>
                </td>
                <td>
                  <select
                    value={c.driverId ?? ''}
                    disabled={inCurs}
                    onChange={(e) => schimbaSofer(c, e.target.value)}
                  >
                    <option value="">— fără șofer —</option>
                    {soferi.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.peCamion && s.id !== c.driverId ? ` (acum pe ${s.peCamion})` : ''}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr><td colSpan={3} className="pivot-empty">{gol}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Flota de camioane</h1>
        <p className="text-muted">
          Aici se ține evidența: ce camion are ce șofer și cine sunt șoferii de camion.
          Camionul fără șofer nu apare în dispecerat — el nu lucrează.
        </p>
      </div>

      {mesaj && <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>{mesaj}</div>}
      {eroare && <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>{eroare}</div>}

      <div className="card">
        <h3>Camioane cu șofer ({active.length})</h3>
        <p className="text-muted">Au titular din parc, deci lucrează.</p>
        {tabelCamioane(active, 'Niciun camion n-are șofer atribuit.')}
      </div>

      <div className="card">
        <h3>Camioane fără șofer ({inactive.length})</h3>
        <p className="text-muted">
          Mașina e a noastră, dar n-are titular. Alege un șofer pe rândul ei și trece în lista de sus.
          Lipsa titularului nu înseamnă că stă: dacă i s-a pus un șofer direct pe cursă, camionul merge
          și apare în dispecerat ca «în cursă», iar dacă face kilometri fără niciun șofer, dispeceratul
          îl arată cu avertisment. Camionul scos din uz nu e în nicio listă de aici — el se reactivează
          din pagina de mașini.
        </p>
        {tabelCamioane(inactive, 'Toate camioanele au șofer.')}

        <h4 style={{ marginTop: 16, marginBottom: 4 }}>Camion nou</h4>
        <p className="text-muted" style={{ marginTop: 0 }}>
          Camionul intră în flotă direct în lista de mai sus, fără șofer. Tipul și șoferul i le pui apoi din tabel.
        </p>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <input
              value={placaNoua}
              onChange={(e) => setPlacaNoua(e.target.value)}
              placeholder="număr, ex: 029 BRAS"
              disabled={inCurs}
            />
            {placaPreview && placaPreview !== placaNoua.trim() && (
              <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 0' }}>Se salvează ca <b>{placaPreview}</b></p>
            )}
          </div>
          <select value={tipNou} onChange={(e) => setTipNou(e.target.value as TipCamion | '')} disabled={inCurs}>
            <option value="">— tip (opțional) —</option>
            <option value="cisterna">cisternă</option>
            <option value="zernovoz">zernovoz</option>
          </select>
          <button
            className="btn-primary"
            disabled={inCurs || !placaPreview}
            onClick={() => ruleaza(async () => {
              const r = await adaugaCamionNou(placaNoua, tipNou || null);
              if (!('error' in r)) { setPlacaNoua(''); setTipNou(''); }
              return r;
            })}
          >
            Adaugă camionul
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Șoferi de camion ({soferi.length}) — {liberi} fără camion</h3>
        <p className="text-muted">
          Numai cine e în această listă poate fi pus pe un camion. Șoferul de uzină nu intră aici
          cât timp e atribuit pe autobuzul lui: acolo atribuirea ține și graficul, și salariul.
        </p>

        <div className="flex gap-2" style={{ marginBottom: 12 }}>
          <select value={candidatAles} onChange={(e) => setCandidatAles(e.target.value)} disabled={inCurs}>
            <option value="">— alege un șofer de adăugat —</option>
            {candidati.map((c) => (
              <option key={c.id} value={c.id} disabled={!!c.blocat}>
                {c.name}{c.blocat ? ` — ${c.blocat}` : ''}
              </option>
            ))}
          </select>
          <button
            className="btn-primary"
            disabled={inCurs || !candidatAles}
            onClick={() => ruleaza(async () => {
              const r = await adaugaSoferCamion(candidatAles);
              if (!('error' in r)) setCandidatAles('');
              return r;
            })}
          >
            Adaugă
          </button>
        </div>

        <h4 style={{ marginTop: 4, marginBottom: 4 }}>Șofer nou</h4>
        <p className="text-muted" style={{ marginTop: 0 }}>
          Pentru cine nu e deloc în sistem. Se creează ca șofer LDE și intră direct în nomenclator.
          Telefonul e opțional — șoferul de camion nu apare pe site.
        </p>
        <div className="flex gap-2" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            value={numeNou}
            onChange={(e) => setNumeNou(e.target.value)}
            placeholder="nume complet, ex: Struna Valeriu"
            disabled={inCurs}
          />
          <input
            value={telefonNou}
            onChange={(e) => setTelefonNou(e.target.value)}
            placeholder="telefon (opțional), ex: 069123456"
            disabled={inCurs}
          />
          <button
            className="btn-primary"
            disabled={inCurs || numeNou.trim().split(/\s+/).length < 2}
            onClick={() => ruleaza(async () => {
              const r = await adaugaSoferNou(numeNou, telefonNou);
              if (!('error' in r)) { setNumeNou(''); setTelefonNou(''); }
              return r;
            })}
          >
            Creează șoferul
          </button>
        </div>

        <div className="pivot-wrap">
          <table className="pivot-table">
            <thead>
              <tr><th>Șofer</th><th>Camion</th><th></th></tr>
            </thead>
            <tbody>
              {soferi.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.peCamion ?? <span className="text-muted">fără camion</span>}</td>
                  <td>
                    <button
                      className="btn-danger"
                      disabled={inCurs}
                      onClick={() => {
                        const avertisment = s.peCamion
                          ? `${s.name} e acum pe ${s.peCamion}. Îl scoți din nomenclator? Camionul rămâne fără șofer.`
                          : `Scoți pe ${s.name} din nomenclatorul de camioane?`;
                        if (!window.confirm(avertisment)) return;
                        ruleaza(() => scoateSoferCamion(s.id));
                      }}
                    >
                      Scoate
                    </button>
                  </td>
                </tr>
              ))}
              {soferi.length === 0 && (
                <tr><td colSpan={3} className="pivot-empty">Niciun șofer în nomenclator — adaugă primul mai sus.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
