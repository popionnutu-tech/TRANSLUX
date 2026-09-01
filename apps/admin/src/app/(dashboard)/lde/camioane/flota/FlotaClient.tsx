'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  adaugaSoferCamion, atribuieSofer, scoateSoferCamion,
  type CamionFlota, type Candidat, type Rezultat, type SoferCamion,
} from './actions';
import { seteazaTipCamion } from '../planificare/actions';

type Props = { camioane: CamionFlota[]; soferi: SoferCamion[]; candidati: Candidat[] };

export default function FlotaClient({ camioane, soferi, candidati }: Props) {
  const router = useRouter();
  const [inCurs, pornesteTranzitia] = useTransition();
  const [mesaj, setMesaj] = useState('');
  const [eroare, setEroare] = useState('');
  const [candidatAles, setCandidatAles] = useState('');

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

  const faraSofer = camioane.filter((c) => !c.driverId).length;
  const liberi = soferi.filter((s) => !s.peCamion).length;

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
        <h3>Camioane ({camioane.length}) — {faraSofer} fără șofer</h3>
        <div className="pivot-wrap">
          <table className="pivot-table">
            <thead>
              <tr><th>Plăcuță</th><th>Tip</th><th>Șofer</th></tr>
            </thead>
            <tbody>
              {camioane.map((c) => (
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
              {camioane.length === 0 && (
                <tr><td colSpan={3} className="pivot-empty">Niciun camion în flotă.</td></tr>
              )}
            </tbody>
          </table>
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
