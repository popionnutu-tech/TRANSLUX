'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  acoperireMetrici, kmGoiVsIncarcati, punctualitate, topAbateri, utilizare,
} from '@/lib/lde/camioane-analitica';
import type { DateAnalitica } from './actions';

const zi = (iso: string) => new Date(iso).toLocaleDateString('ro-MD', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit' });
const minute = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v} min`);

export default function AnaliticaClient({ de, la, zile, camioane, curse, stari, kmZilnic }: DateAnalitica) {
  const router = useRouter();

  const acoperire = useMemo(() => acoperireMetrici(curse), [curse]);
  const abateri = useMemo(() => topAbateri(curse), [curse]);
  const peSofer = useMemo(() => punctualitate(curse, (c) => c.driverName ?? ''), [curse]);
  const peDirectie = useMemo(() => punctualitate(curse, (c) => (c.de && c.la ? `${c.de} → ${c.la}` : '')), [curse]);
  const flota = useMemo(() => utilizare(camioane, curse, stari, zile), [camioane, curse, stari, zile]);
  const km = useMemo(() => kmGoiVsIncarcati(curse, kmZilnic, zile), [curse, kmZilnic, zile]);

  function schimbaPerioada(camp: 'de' | 'la', v: string) {
    const p = new URLSearchParams({ de, la });
    p.set(camp, v);
    router.push(`/lde/camioane/analitica?${p.toString()}`);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Analitică livrări și trasee</h1>
        <p className="text-muted">
          Cifrele vin din GPS, calculate noaptea. Cursele fără metrici încă n-au fost măsurate.
        </p>
      </div>

      <div className="filter-bar">
        <label>De la</label>
        <input type="date" value={de} onChange={(e) => schimbaPerioada('de', e.target.value)} />
        <label>Până la</label>
        <input type="date" value={la} onChange={(e) => schimbaPerioada('la', e.target.value)} />
        <span className="text-muted">
          {acoperire.cuMetrici} din {acoperire.total} curse măsurate
          {acoperire.faraIdeal > 0 && ` · ${acoperire.faraIdeal} fără traseu ideal`}
        </span>
      </div>

      {acoperire.total === 0 && (
        <div className="card">Nicio cursă în perioada aleasă.</div>
      )}

      <div className="card">
        <h3>Km goi vs încărcați</h3>
        {acoperire.cuMetrici < acoperire.total && (
          <p className="text-muted" style={{ borderLeft: '3px solid var(--warning)', paddingLeft: 8 }}>
            Doar {acoperire.cuMetrici} din {acoperire.total} curse au metrici GPS — km-ii curselor
            nemăsurate apar aici drept «goi». Cifra e exactă la acoperire completă.
          </p>
        )}
        {km.procentGol === null ? (
          <p className="text-muted">Nu există km GPS pentru perioadă — workerul de noapte încă n-a scris nimic.</p>
        ) : (
          <div className="grid-4">
            <div><div className="text-muted">Km totali (GPS)</div><strong>{km.kmTotali}</strong></div>
            <div><div className="text-muted">Km în curse</div><strong>{km.kmIncarcati}</strong></div>
            <div><div className="text-muted">Km goi</div><strong>{km.kmGoi}</strong></div>
            <div><div className="text-muted">Procent gol</div><strong>{km.procentGol}%</strong></div>
          </div>
        )}
        <p className="text-muted" style={{ marginTop: 8 }}>
          Estimare: km-ii totali vin din calculul zilnic al flotei, cei «în curse» din
          măsurarea fiecărei curse — două calcule apropiate, dar nu identice. Se numără
          doar cursele încheiate în perioada aleasă.
        </p>
      </div>

      <div className="card">
        <h3>Abateri de traseu (real vs ideal)</h3>
        {abateri.length === 0 ? (
          <p className="text-muted">
            Traseu ideal indisponibil pentru cursele din perioadă — abaterile nu se pot calcula.
            (Se cere un furnizor de rutare configurat pe worker și puncte cu coordonate.)
          </p>
        ) : (
          <div className="pivot-wrap">
            <table className="pivot-table">
              <thead><tr><th>Camion</th><th>Traseu</th><th>Plecare</th><th>Real</th><th>Ideal</th><th>Abatere</th><th>Opriri &gt;30 min</th></tr></thead>
              <tbody>
                {abateri.map((c) => (
                  <tr key={c.tripId}>
                    <td>{c.plate}</td>
                    <td>{c.de ?? '?'} → {c.la ?? '?'}</td>
                    <td>{zi(c.loadPlannedAt)}</td>
                    <td>{c.kmReal ?? '—'}</td>
                    <td>{c.kmIdeal ?? '—'}</td>
                    <td><strong>{c.kmDeviation !== null ? `${c.kmDeviation > 0 ? '+' : ''}${c.kmDeviation} km` : '—'}</strong></td>
                    <td>{c.stops ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Punctualitate pe șofer</h3>
          <p className="text-muted">«Întârziate» = sosire la descărcare cu peste 30 min după plan, doar dintre cursele măsurate.</p>
          <div className="pivot-wrap">
            <table className="pivot-table">
              <thead><tr><th>Șofer</th><th>Curse</th><th>Măsurate</th><th>Încărcare</th><th>Descărcare</th><th>Întârziate</th></tr></thead>
              <tbody>
                {peSofer.map((p) => (
                  <tr key={p.cheie}>
                    <td>{p.cheie}</td><td>{p.curse}</td>
                    <td className={p.masurate < p.curse ? 'text-muted' : ''}>{p.masurate}</td>
                    <td>{minute(p.intarziereMedieIncarcare)}</td>
                    <td>{minute(p.intarziereMedieDescarcare)}</td>
                    <td>{p.intarziate}</td>
                  </tr>
                ))}
                {peSofer.length === 0 && <tr><td colSpan={6} className="pivot-empty">—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Punctualitate pe direcție</h3>
          <div className="pivot-wrap">
            <table className="pivot-table">
              <thead><tr><th>Direcție</th><th>Curse</th><th>Măsurate</th><th>Descărcare</th><th>Întârziate</th></tr></thead>
              <tbody>
                {peDirectie.map((p) => (
                  <tr key={p.cheie}>
                    <td>{p.cheie}</td><td>{p.curse}</td>
                    <td className={p.masurate < p.curse ? 'text-muted' : ''}>{p.masurate}</td>
                    <td>{minute(p.intarziereMedieDescarcare)}</td>
                    <td>{p.intarziate}</td>
                  </tr>
                ))}
                {peDirectie.length === 0 && <tr><td colSpan={5} className="pivot-empty">—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Utilizarea flotei ({zile.length} zile)</h3>
        <div className="pivot-wrap">
          <table className="pivot-table">
            <thead><tr><th>Camion</th><th>În cursă</th><th>Reparație</th><th>Odihnă</th><th>Fără nimic</th></tr></thead>
            <tbody>
              {flota.map((f) => (
                <tr key={f.vehicleId}>
                  <td>{f.plate}</td>
                  <td><strong>{f.zileInCursa}</strong></td>
                  <td>{f.zileReparatie}</td>
                  <td>{f.zileOdihna}</td>
                  <td className={f.zileLibere === zile.length ? 'text-muted' : ''}>{f.zileLibere}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
