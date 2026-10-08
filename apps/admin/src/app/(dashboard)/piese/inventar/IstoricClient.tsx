'use client';

import { useState, useEffect } from 'react';
import { listaNumaratori, detaliiNumaratoareAction } from './scan-actions';

type Rand = {
  session_id: number; warehouse_id: number; depozit: string; status: string; actor: string | null;
  deschisa: string; inchisa: string | null; document_id: number | null;
  pozitii: number; diferente: number; celule: number;
};
type Detaliu = {
  part_id: number; nume: string; articol: string; unit: string; adresa: string;
  numarat: number; delta: number; in_program: number;
};

const nr = (n: number) => Number(n).toLocaleString('ro-RO', { maximumFractionDigits: 3 });
const zi = (s: string | null) => (s ? new Date(s).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', dateStyle: 'short', timeStyle: 'short' }) : '—');

// Vizualizarea unei numărători ÎNCHISE. Cerut de Eduard (08.10): până acum, odată apăsat „Închide",
// numărătoarea dispărea din ecran — rămânea doar documentul de corecție în lista de documente, fără
// celule și fără „ce s-a numărat unde".
export default function IstoricClient() {
  const [randuri, setRanduri] = useState<Rand[]>([]);
  const [ales, setAles] = useState<number | null>(null);
  const [detalii, setDetalii] = useState<Detaliu[]>([]);
  const [doarDif, setDoarDif] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setBusy(true);
      try { setRanduri(await listaNumaratori() as Rand[]); }
      catch (e: any) { setErr(e.message); }
      finally { setBusy(false); }
    })();
  }, []);

  async function deschide(id: number) {
    if (ales === id) { setAles(null); setDetalii([]); return; }
    setBusy(true); setErr(null);
    try { setDetalii(await detaliiNumaratoareAction(id) as Detaliu[]); setAles(id); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const vizibile = doarDif ? detalii.filter((d) => Number(d.delta) !== 0) : detalii;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Numărători închise</h2>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        Ce s-a numărat, în ce celulă, și cât avea programul înainte. Apasă pe un rând ca să vezi pozițiile.
      </p>
      {err && <div className="alert danger">{err}</div>}

      <table>
        <thead><tr>
          <th style={{ width: 60 }}>Nr.</th><th>Depozit</th><th>Cine</th>
          <th style={{ width: 130 }}>Închisă</th>
          <th style={{ width: 80 }} className="num">Poziții</th>
          <th style={{ width: 90 }} className="num">Diferențe</th>
          <th style={{ width: 70 }} className="num">Celule</th>
          <th style={{ width: 90 }}>Stare</th>
        </tr></thead>
        <tbody>
          {randuri.map((r) => (
            <tr key={r.session_id} onClick={() => deschide(r.session_id)}
              style={{ cursor: 'pointer', background: ales === r.session_id ? 'rgba(155,27,48,0.06)' : undefined }}>
              <td>#{r.session_id}</td>
              <td>{r.depozit}</td>
              <td>{r.actor || <span className="muted">—</span>}</td>
              <td>{zi(r.inchisa)}</td>
              <td className="num">{r.pozitii}</td>
              <td className="num">{r.diferente || <span className="muted">—</span>}</td>
              <td className="num">{r.celule}</td>
              <td>
                {r.status === 'COMMITTED'
                  ? <span style={{ color: '#0a7', fontWeight: 600 }}>închisă</span>
                  : <span className="muted">anulată</span>}
              </td>
            </tr>
          ))}
          {!randuri.length && !busy && (
            <tr><td colSpan={8} className="muted">Nicio numărătoare închisă încă.</td></tr>
          )}
        </tbody>
      </table>

      {ales != null && (
        <div style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Pozițiile numărătorii #{ales}</h3>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={doarDif} onChange={(e) => setDoarDif(e.target.checked)} style={{ width: 'auto' }} />
              Doar pozițiile cu diferență
            </label>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead><tr>
              <th>Piesa</th><th style={{ width: 110 }}>Celula</th>
              <th style={{ width: 90 }} className="num">Numărat</th>
              <th style={{ width: 110 }} className="num">În program</th>
              <th style={{ width: 90 }} className="num">Diferența</th>
            </tr></thead>
            <tbody>
              {vizibile.map((d) => {
                const dl = Number(d.delta);
                return (
                  <tr key={d.part_id}>
                    <td>{d.nume}{d.articol ? <span className="muted"> · {d.articol}</span> : null}</td>
                    <td style={{ fontFamily: 'monospace' }}>{d.adresa}</td>
                    <td className="num">{nr(d.numarat)} {d.unit}</td>
                    <td className="num muted">{nr(d.in_program)}</td>
                    <td className="num" style={{ color: dl === 0 ? undefined : dl > 0 ? '#0a7' : '#c33', fontWeight: dl === 0 ? undefined : 600 }}>
                      {dl === 0 ? '—' : (dl > 0 ? '+' : '') + nr(dl)}
                    </td>
                  </tr>
                );
              })}
              {!vizibile.length && (
                <tr><td colSpan={5} className="muted">
                  {doarDif ? 'Nicio diferență — tot ce s-a numărat se potrivea cu programul.' : 'Nicio poziție.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
