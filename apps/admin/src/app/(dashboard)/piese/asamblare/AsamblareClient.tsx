'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import SearchSelect from '@/components/SearchSelect';
import { searchParts } from '../search-parts';
import { deschide, adauga, inchide, anuleaza, incarcaInLucru, incarcaComponente } from './actions';

type Opt = { id: number; label: string };
type InLucru = {
  doc_id: number; created_at: string; zile_deschis: number;
  din_depozit: string; in_depozit: string; produs: string; produs_qty: number;
  note: string | null; lacatus: string | null; componente: number; valoare_in_lucru: number;
};
type Componenta = { id: number; part_id: number; qty: number; unit_cost: number; nume: string; articol: string; unit: string };

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AsamblareClient({ warehouses, mechanics }: { warehouses: Opt[]; mechanics: Opt[] }) {
  const router = useRouter();
  const [lucru, setLucru] = useState<InLucru[]>([]);
  const [ales, setAles] = useState<number | null>(null);
  const [comp, setComp] = useState<Componenta[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // deschiderea
  const [whSursa, setWhSursa] = useState<number | ''>(warehouses[0]?.id ?? '');
  const [whDest, setWhDest] = useState<number | ''>(warehouses[0]?.id ?? '');
  const [produsId, setProdusId] = useState<number | ''>('');
  const [produsLabel, setProdusLabel] = useState('');
  const [produsQty, setProdusQty] = useState(1);
  const [mechanicId, setMechanicId] = useState<number | ''>('');
  const [note, setNote] = useState('');

  // adăugarea unei componente
  const [partId, setPartId] = useState<number | ''>('');
  const [partLabel, setPartLabel] = useState('');
  const [qty, setQty] = useState(1);
  const [pesteStoc, setPesteStoc] = useState(false);
  const [manopera, setManopera] = useState('');

  const reincarca = useCallback(async () => {
    try { setLucru(await incarcaInLucru() as InLucru[]); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { void reincarca(); }, [reincarca]);

  async function deschideDoc(fn: () => Promise<void>) {
    setBusy(true); setErr(null); setInfo(null);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function vezi(docId: number) {
    if (ales === docId) { setAles(null); setComp([]); return; }
    await deschideDoc(async () => { setComp(await incarcaComponente(docId) as Componenta[]); setAles(docId); });
  }

  const totalInLucru = lucru.reduce((s, x) => s + Number(x.valoare_in_lucru || 0), 0);

  return (
    <>
      {/* „Ce e acum în lucru" — cerut de Mariana. Suma de aici e valoarea care a IEȘIT din depozite și
          încă n-a devenit produs: singurul loc în care marfa nu e nici pe raft, nici montată. Coloana cu
          zilele e cea pe care se uită conducerea — un document uitat deschis se vede. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>În lucru acum</h2>
          {lucru.length > 0 && (
            <strong>{lucru.length} {lucru.length === 1 ? 'reparație' : 'reparații'} · {lei(totalInLucru)} lei în piese</strong>
          )}
        </div>
        {err && <div className="alert danger" style={{ marginTop: 10 }}>{err}</div>}
        {info && <div className="alert ok" style={{ marginTop: 10 }}>{info}</div>}

        {lucru.length === 0 ? (
          <div className="empty" style={{ marginTop: 8 }}>Nicio asamblare deschisă.</div>
        ) : (
          <table style={{ marginTop: 10 }}>
            <thead><tr>
              <th style={{ width: 60 }}>Nr.</th><th>Se face</th><th>Din → în</th><th>Lăcătuș</th>
              <th style={{ width: 80 }} className="num">Piese</th>
              <th style={{ width: 110 }} className="num">Valoare</th>
              <th style={{ width: 90 }} className="num">Deschis de</th>
            </tr></thead>
            <tbody>
              {lucru.map((x) => (
                <tr key={x.doc_id} onClick={() => vezi(x.doc_id)}
                  style={{ cursor: 'pointer', background: ales === x.doc_id ? 'rgba(155,27,48,0.06)' : undefined }}>
                  <td>#{x.doc_id}</td>
                  <td><strong>{x.produs}</strong>{Number(x.produs_qty) !== 1 ? ` × ${x.produs_qty}` : ''}
                    {x.note ? <span className="muted"> · {x.note}</span> : null}</td>
                  <td className="muted">{x.din_depozit} → {x.in_depozit}</td>
                  <td className="muted">{x.lacatus || '—'}</td>
                  <td className="num">{x.componente}</td>
                  <td className="num">{lei(x.valoare_in_lucru)}</td>
                  {/* Peste zece zile, reparația e fie uitată, fie trebuie explicată. */}
                  <td className="num" style={{ color: x.zile_deschis >= 10 ? '#c33' : undefined, fontWeight: x.zile_deschis >= 10 ? 600 : undefined }}>
                    {x.zile_deschis} {x.zile_deschis === 1 ? 'zi' : 'zile'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {ales != null && (
          <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Piesele puse în #{ales}</h3>
            {comp.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>Încă nicio piesă.</p>
            ) : (
              <table>
                <thead><tr><th>Piesa</th><th style={{ width: 100 }} className="num">Cantitate</th><th style={{ width: 110 }} className="num">Cost</th></tr></thead>
                <tbody>
                  {comp.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nume}{c.articol ? <span className="muted"> · {c.articol}</span> : null}</td>
                      <td className="num">{c.qty} {c.unit}</td>
                      <td className="num">{lei(c.qty * c.unit_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 12, alignItems: 'flex-end' }}>
              <div className="form-row" style={{ flex: 1, minWidth: 260 }}>
                <label>Mai adaugă o piesă</label>
                <SearchSelect searchFn={searchParts} value={partId} selectedLabel={partLabel}
                  onSelect={(o) => { setPartId(o ? o.id : ''); setPartLabel(o?.label ?? ''); }}
                  placeholder="— caută piesa pusă în reparație —" />
              </div>
              <div className="form-row" style={{ width: 110 }}>
                <label>Cantitate</label>
                <input type="number" min={0.001} step="any" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                {/* Cerut explicit: «сохранялось с минусом». Cât timp soldul inițial al magazinului nu e
                    încărcat, fără asta nu se poate lucra. Rămâne o alegere conștientă, cu urmă în jurnal. */}
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={pesteStoc} onChange={(e) => setPesteStoc(e.target.checked)} style={{ width: 'auto' }} />
                  continuă cu minus
                </label>
              </div>
              <button className="btn btn-primary" disabled={busy || partId === ''}
                onClick={() => deschideDoc(async () => {
                  const r = await adauga(ales, Number(partId), Number(qty), pesteStoc);
                  setInfo(r.lipsa > 0
                    ? `Adăugat cu minus: lipseau ${r.lipsa}. Cost ${lei(r.cost)} lei.`
                    : `Adăugat. Cost ${lei(r.cost)} lei.`);
                  setPartId(''); setPartLabel(''); setQty(1);
                  setComp(await incarcaComponente(ales) as Componenta[]); await reincarca(); router.refresh();
                })}>Adaugă</button>
            </div>

            <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'flex-end' }}>
              <div className="form-row" style={{ width: 150 }}>
                <label>Manoperă, lei</label>
                <input type="number" min={0} step="0.01" value={manopera}
                  onChange={(e) => setManopera(e.target.value)} placeholder="0" style={{ textAlign: 'right' }} />
              </div>
              <button className="btn btn-primary btn-lg" disabled={busy || comp.length === 0}
                onClick={() => deschideDoc(async () => {
                  const r = await inchide(ales, manopera);
                  setInfo(`Gata: piese ${lei(r.cost_componente)} + manoperă ${lei(r.manopera)} = ${lei(r.cost_total)} lei. Costul unei bucăți: ${lei(r.cost_unitar)} lei.`);
                  setAles(null); setComp([]); setManopera(''); await reincarca(); router.refresh();
                })}>Termină reparația</button>
              <button className="btn btn-outline" disabled={busy}
                onClick={() => {
                  if (!confirm('Anulezi reparația? Toate piesele puse se întorc în depozit.')) return;
                  void deschideDoc(async () => {
                    const r = await anuleaza(ales);
                    setInfo(`Anulată. ${r.intoarse} ${r.intoarse === 1 ? 'piesă s-a întors' : 'piese s-au întors'} în depozit.`);
                    setAles(null); setComp([]); await reincarca(); router.refresh();
                  });
                }}>Anulează reparația</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Începe o reparație nouă</h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="form-row" style={{ minWidth: 190 }}>
            <label>Piesele se iau din</label>
            <select value={whSursa} onChange={(e) => setWhSursa(e.target.value === '' ? '' : Number(e.target.value))}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ minWidth: 190 }}>
            <label>Produsul va intra în</label>
            <select value={whDest} onChange={(e) => setWhDest(e.target.value === '' ? '' : Number(e.target.value))}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ flex: 1, minWidth: 260 }}>
            <label>Ce se repară / ce rezultă</label>
            <SearchSelect searchFn={searchParts} value={produsId} selectedLabel={produsLabel}
              onSelect={(o) => { setProdusId(o ? o.id : ''); setProdusLabel(o?.label ?? ''); }}
              placeholder="— caută piesa care iese —" />
          </div>
          <div className="form-row" style={{ width: 110 }}>
            <label>Câte bucăți</label>
            <input type="number" min={0.001} step="any" value={produsQty} onChange={(e) => setProdusQty(Number(e.target.value))} />
          </div>
          <div className="form-row" style={{ minWidth: 180 }}>
            <label>Lăcătuș</label>
            <select value={mechanicId} onChange={(e) => setMechanicId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">—</option>
              {mechanics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ flex: 1, minWidth: 200 }}>
            <label>Comentariu</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: motor OM906, autobuz 553GHT" />
          </div>
        </div>
        <button className="btn btn-primary btn-lg" style={{ marginTop: 12 }}
          disabled={busy || produsId === '' || whSursa === '' || whDest === ''}
          onClick={() => deschideDoc(async () => {
            const r = await deschide({
              whSursa: Number(whSursa), whDest: Number(whDest), produsId: Number(produsId),
              produsQty: Number(produsQty) || 1,
              mechanicId: mechanicId === '' ? null : Number(mechanicId), note,
            });
            setInfo(`Reparația #${r.docId} e deschisă. Adaugă piesele pe măsură ce le pui.`);
            setProdusId(''); setProdusLabel(''); setProdusQty(1); setNote('');
            await reincarca(); setAles(r.docId); setComp([]); router.refresh();
          })}>Deschide reparația</button>
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Piesele ies din depozit în momentul în care le adaugi — acolo chiar nu mai sunt. Produsul apare
          abia când termini reparația, cu costul pieselor plus manopera.
        </p>
      </div>
    </>
  );
}
