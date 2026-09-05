'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { submitTransfer, receiveTransfer, loadTransferLines, loadSentTransfers, cancelTransfer } from './actions';
import { searchParts } from '../search-parts';
import SearchSelect from '@/components/SearchSelect';

interface Opt { id: number; label: string }
// `kind` e nevoie ca să filtrăm destinația la mutările pe mașină (doar depozite interne).
interface WhOpt extends Opt { kind?: string }
interface Line { part_id: number | ''; part_label?: string; qty: number }
interface Transit { id: number; from_name: string; to_name: string; line_count: number }

// `warehouses` = toate (pentru „Către"); `fromWarehouses` = doar depozitul contului legat (pentru „De la"). Egale la ADMIN/cont extins.
type TLine = { partId: number; name: string; article: string | null; qty: number };
type TBody = { rows: TLine[]; truncated: boolean };

export default function MutariClient({ warehouses, fromWarehouses, transit, vehicles, mechanics }: {
  warehouses: WhOpt[]; fromWarehouses: Opt[]; transit: Transit[];
  vehicles: Opt[]; mechanics: Opt[];
}) {
  const router = useRouter();
  const [from, setFrom] = useState(fromWarehouses[0]?.id || 0);
  const [to, setTo] = useState(warehouses.find((w) => w.id !== (fromWarehouses[0]?.id || 0))?.id || 0);
  const [lines, setLines] = useState<Line[]>([{ part_id: '', qty: 1 }]);
  // Mutarea „pe automobil" (migr. 319): marfa pleacă din magazin PENTRU o mașină anume, iar la destinație
  // se confirmă în ecranul Rashod și devine eliberare. Aici se notează doar intenția.
  const [forVehicle, setForVehicle] = useState(false);
  const [vehicleId, setVehicleId] = useState<number | ''>('');
  const [mechanicId, setMechanicId] = useState<number | ''>('');
  // Ce a trimis depozitul ăsta și nu i s-a confirmat. Mutările pe mașină se confirmă în Rashod, deci fără
  // panoul ăsta expeditorul n-ar mai vedea marfa proprie ieșită din stoc.
  const [sent, setSent] = useState<{ id: number; toName: string; vehiclePlate: string | null; createdAt: string; lineCount: number }[]>([]);
  const [cancelBusy, setCancelBusy] = useState<number | null>(null);

  const refreshSent = useCallback(async (wid: number) => {
    if (!wid) { setSent([]); return; }
    try { setSent(await loadSentTransfers(wid) as any[]); } catch { setSent([]); }
  }, []);
  useEffect(() => { refreshSent(from); }, [from, refreshSent]);

  async function doCancel(id: number) {
    if (!confirm('Anulezi mutarea? Marfa se întoarce în depozitul tău.')) return;
    setCancelBusy(id); setMsg(null);
    try {
      const r = await cancelTransfer(id, from);
      setMsg({ t: 'ok', m: `Mutare anulată — marfa s-a întors (${r.restored} ${r.restored === 1 ? 'poziție' : 'poziții'}).` });
      await refreshSent(from); router.refresh();
    } catch (e: any) { setMsg({ t: 'danger', m: e.message }); }
    finally { setCancelBusy(null); }
  }

  // Destinația unei mutări PE MAȘINĂ trebuie să fie un depozit intern: confirmarea se face în ecranul
  // Rashod, care listează doar depozite interne. Către magazin, mutarea ar rămâne blocată pe veci.
  const destWarehouses = forVehicle ? warehouses.filter((w) => w.kind === 'INTERNAL') : warehouses;
  const [busy, setBusy] = useState(false);
  // Poziţiile mutărilor „pe drum", încărcate la cerere (o mutare are rar mai mult de câteva rânduri).
  const [openId, setOpenId] = useState<number | null>(null);
  const [tLines, setTLines] = useState<Record<number, TBody | 'loading' | 'error'>>({});
  async function toggleTransit(id: number) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!tLines[id] || tLines[id] === 'error') {
      setTLines((m) => ({ ...m, [id]: 'loading' }));
      try {
        const rows = await loadTransferLines(id);
        setTLines((m) => ({ ...m, [id]: rows }));
      } catch {
        // Stare explicită de eroare: ștergerea cheii ar fi lăsat rândul pe „Se încarcă…" la nesfârșit,
        // fiindcă „lipsă" și „în curs" arătau la fel.
        setTLines((m) => ({ ...m, [id]: 'error' }));
      }
    }
  }

  const [msg, setMsg] = useState<{ t: 'ok' | 'danger'; m: string } | null>(null);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function send() {
    setBusy(true); setMsg(null);
    try {
      const r = await submitTransfer({
        from_warehouse_id: from, to_warehouse_id: to,
        lines: lines.filter((l) => l.part_id).map((l) => ({ part_id: Number(l.part_id), qty: l.qty })),
        vehicle_id: forVehicle && vehicleId ? Number(vehicleId) : null,
        mechanic_id: forVehicle && mechanicId ? Number(mechanicId) : null,
      });
      // Mesajul spune UNDE se confirmă: altfel depozitarul ar căuta mutarea în lista de aici, unde nu mai
      // apare (ar confirma-o fără rashod, iar marfa ar rămâne pe depozit neatribuită).
      setMsg({ t: 'ok', m: r.forVehicle
        ? 'Mutare trimisă pentru mașină. Se confirmă în ecranul „Eliberare pe mașină" — acolo devine rashod.'
        : 'Mutare trimisă. Acum e „pe drum" — de confirmat la primire.' });
      setLines([{ part_id: '', qty: 1 }]); setForVehicle(false); setVehicleId(''); setMechanicId('');
      await refreshSent(from);
      router.refresh();
    }
    catch (e: any) { setMsg({ t: 'danger', m: e.message }); } finally { setBusy(false); }
  }
  async function receive(id: number) {
    setBusy(true); setMsg(null);
    try { await receiveTransfer(id); setMsg({ t: 'ok', m: 'Mutare primită. Stocul a intrat în depozitul destinație.' }); router.refresh(); }
    catch (e: any) { setMsg({ t: 'danger', m: e.message }); } finally { setBusy(false); }
  }

  return (
    <>
      {msg && <div className={`alert ${msg.t}`}>{msg.m}</div>}
      <div className="card">
        <h2>„Pe drum" — de confirmat la primire</h2>
        {transit.length === 0 ? <div className="empty">Nicio mutare în așteptare.</div> : (
          <table>
            <thead><tr><th>De la</th><th>La</th><th className="num">Poziții</th><th></th></tr></thead>
            <tbody>
              {transit.map((t) => (
                <Fragment key={t.id}>
                  <tr onClick={() => toggleTransit(t.id)} style={{ cursor: 'pointer' }} title="Apasă ca să vezi ce piese conține">
                    <td>{t.from_name}</td><td>{t.to_name}</td>
                    <td className="num">{openId === t.id ? '▾' : '▸'} {t.line_count}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-primary" disabled={busy} onClick={() => receive(t.id)} style={{ padding: '6px 14px' }}>Confirmă primirea</button>
                    </td>
                  </tr>
                  {openId === t.id && (
                    <tr>
                      <td colSpan={4} style={{ padding: 0 }}>
                        <div style={{ padding: '10px 14px', borderLeft: '4px solid var(--accent, #0d5c4d)' }}>
                          {tLines[t.id] === 'loading' && <span className="muted">Se încarcă…</span>}
                          {tLines[t.id] === 'error' && <span className="muted">Nu am putut încărca poziţiile. Apasă din nou.</span>}
                          {typeof tLines[t.id] === 'object' && ((tLines[t.id] as TBody).rows.length === 0
                            ? <span className="muted">Fără poziții.</span>
                            : (
                              <table>
                                <thead><tr><th>Piesă</th><th className="num">Cantitate</th></tr></thead>
                                <tbody>
                                  {(tLines[t.id] as TBody).rows.map((l, i) => (
                                    <tr key={`${l.partId}-${i}`}>
                                      <td>{l.name}{l.article && <span className="muted"> · {l.article}</span>}</td>
                                      <td className="num">{l.qty}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {/* Ce a plecat din depozitul ăsta și nu s-a confirmat încă. Mutările pe mașină se confirmă în
          Rashod, deci aici e singurul loc unde expeditorul își mai vede marfa cât e pe drum. */}
      {sent.length > 0 && (
        <div className="card">
          <h2>Trimise, în așteptare</h2>
          <p className="muted" style={{ marginTop: -6 }}>
            Marfa a ieșit din depozit și așteaptă confirmarea la destinație. Dacă nu ajunge sau s-a greșit,
            anuleaz-o — se întoarce în stocul tău.
          </p>
          <table>
            <thead><tr><th>Către</th><th className="num" style={{ width: 80 }}>Poziții</th><th style={{ width: 110 }}>Trimisă</th><th style={{ width: 120 }}></th></tr></thead>
            <tbody>
              {sent.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.toName}
                    {t.vehiclePlate && <span className="badge info" style={{ marginLeft: 6 }}>pe mașina {t.vehiclePlate}</span>}
                    <div className="muted" style={{ fontSize: 11 }}>#{t.id}</div>
                  </td>
                  <td className="num">{t.lineCount}</td>
                  <td className="muted">{new Date(t.createdAt).toLocaleDateString('ro-RO')}</td>
                  <td>
                    <button type="button" className="btn" style={{ padding: '3px 9px' }}
                      disabled={cancelBusy !== null} onClick={() => doCancel(t.id)}>
                      {cancelBusy === t.id ? 'Se anulează…' : 'Anulează'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Trimite o mutare nouă</h2>
        <div className="row">
          <div className="form-row"><label>De la depozit</label><select value={from} onChange={(e) => setFrom(Number(e.target.value))}>{fromWarehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
          <div className="form-row"><label>Către depozit</label><select value={to} onChange={(e) => setTo(Number(e.target.value))}>{destWarehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
        </div>

        {/* Cerut de Eduard: marfa din magazin ajunge pe autobuz printr-o mutare care poartă mașina și
            lăcătușul, iar la destinație se confirmă și devine rashod. Așa evidența magazinului rămâne
            curată, iar costul ajunge pe mașină pe drumul normal. */}
        <div style={{ marginTop: 4 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', width: 'fit-content' }}>
            <input type="checkbox" checked={forVehicle}
              onChange={(e) => {
                const on = e.target.checked;
                setForVehicle(on);
                if (!on) { setVehicleId(''); setMechanicId(''); return; }
                // Dacă destinația aleasă nu e internă, o mutăm pe prima validă — altfel omul ar bifa și
                // ar trimite către magazin fără să observe, iar mutarea ar fi respinsă abia la salvare.
                const ok = warehouses.filter((w) => w.kind === 'INTERNAL');
                if (!ok.some((w) => w.id === to)) setTo(ok[0]?.id ?? 0);
              }}
              style={{ width: 'auto' }} />
            <strong>Pe automobil</strong>
            <span className="muted" style={{ fontSize: 12 }}>— se confirmă în „Eliberare pe mașină" și devine rashod</span>
          </label>
        </div>
        {forVehicle && (
          <div className="row" style={{ marginTop: 8 }}>
            <div className="form-row"><label>Mașina *</label>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— alege mașina —</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div className="form-row"><label>Mecanic / lăcătuș</label>
              <select value={mechanicId} onChange={(e) => setMechanicId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">—</option>
                {mechanics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>
        )}
        <table>
          <thead><tr><th>Piesă</th><th style={{ width: 140 }}>Cantitate</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><SearchSelect searchFn={searchParts} value={l.part_id} selectedLabel={l.part_label} onSelect={(o) => setLine(i, { part_id: o ? o.id : '', part_label: o?.label })} placeholder="— caută piesa —" /></td>
                <td><input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
                <td>{lines.length > 1 && <button className="btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} style={{ padding: '4px 10px' }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" onClick={() => setLines((ls) => [...ls, { part_id: '', qty: 1 }])} style={{ marginTop: 10 }}>+ Adaugă poziție</button>
        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 12 }}
          disabled={busy || (forVehicle && !vehicleId)} onClick={send}>
          {forVehicle ? 'Trimite mutarea pe mașină' : 'Trimite mutarea'}
        </button>
      </div>
    </>
  );
}
