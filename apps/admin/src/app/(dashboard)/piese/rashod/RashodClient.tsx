'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { checkIssue, checkIssueMany, submitIssue, loadTodayIssue } from './actions';
import { searchParts } from '../search-parts';
import SearchSelect from '@/components/SearchSelect';

interface Opt { id: number; label: string }
// `uid` stabil per rând: avertismentele se leagă de RÂND, nu de poziția lui în listă. Cu indici,
// ștergerea unui rând din mijloc muta avertismentele pe piesele vecine — „stoc epuizat" apărea sub o
// piesă care era pe stoc. E și cheia React, ca `SearchSelect` să nu-și mute starea internă între rânduri.
type Line = { uid: string; part_id: number | ''; label?: string; qty: number };
type Alert = { stock: number; alert: { level: string; messages: string[] } | null };
type TodayLine = { partId: number; name: string; article: string | null; qty: number; unitCost: number | null };
type Today = { id: number; docCount: number; positions: number; lines: TodayLine[]; truncated: boolean } | null;

let seq = 0;
const blank = (): Line => ({ uid: `l${++seq}`, part_id: '', qty: 1 });

export default function RashodClient({ warehouses, vehicles, mechanics, reasons }: {
  warehouses: Opt[]; vehicles: (Opt & { km: number })[]; mechanics: Opt[]; reasons: Opt[];
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || 0);
  const [vehicleId, setVehicleId] = useState<number | ''>('');
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [mechanicId, setMechanicId] = useState<number | ''>('');
  const [reasonId, setReasonId] = useState<number | ''>('');
  // Avertismentele (stoc, normă de km, schimbat prea des) sunt PER LINIE: la o reparație cu opt piese,
  // un singur mesaj global n-ar spune despre care dintre ele e vorba.
  const [alerts, setAlerts] = useState<Record<string, Alert>>({});
  // Oglinda liniilor curente, pentru efectul de mai jos: îl vrem declanșat de depozit/mașină, nu de tastare.
  const linesRef = useRef<Line[]>([]);
  const [today, setToday] = useState<Today>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const km = vehicles.find((v) => v.id === Number(vehicleId))?.km;
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const filled = lines.filter((l) => l.part_id && l.qty > 0);
  linesRef.current = lines;

  // Ce s-a dat DEJA azi pe mașina asta — încărcat la alegerea mașinii, ca depozitarul să vadă înainte
  // de a adăuga, nu după. Fără asta, „am pus deja filtrul?" se răspundea doar căutând prin documente.
  // Contor de cereri: la două schimbări rapide de mașină, răspunsul mai vechi nu are voie să suprascrie
  // panoul celei noi — altfel `doc_id` trimis la salvare ar fi al mașinii precedente.
  const todaySeq = useRef(0);
  const refreshToday = useCallback(async (wid: number, vid: number | '') => {
    const my = ++todaySeq.current;
    if (!wid || !vid) { setToday(null); return; }
    try {
      const r = await loadTodayIssue(wid, Number(vid)) as Today;
      if (my === todaySeq.current) setToday(r);
    } catch {
      if (my === todaySeq.current) setToday(null);
    }
  }, []);

  useEffect(() => { refreshToday(warehouseId, vehicleId); }, [warehouseId, vehicleId, refreshToday]);

  // Avertismentul (stoc, normă de km, schimbat prea des) se cere pe RÂND, identificat prin `uid`.
  const alertSeq = useRef<Record<string, number>>({});
  const checkLine = useCallback(async (uid: string, partId: number, wid: number, vid: number | '') => {
    if (!partId || !wid) { setAlerts((a) => { const n = { ...a }; delete n[uid]; return n; }); return; }
    const my = (alertSeq.current[uid] = (alertSeq.current[uid] || 0) + 1);
    try {
      const r = await checkIssue(wid, vid ? Number(vid) : null, partId);
      if (my === alertSeq.current[uid]) setAlerts((a) => ({ ...a, [uid]: r as Alert }));
    } catch { /* avertismentul lipsă nu blochează eliberarea */ }
  }, []);

  // Stocul și norma depind de depozit și de mașină: la schimbarea lor, avertismentele afișate devin
  // false (arătau stocul din alt depozit). Le recalculăm pentru toate rândurile cu piesă aleasă —
  // într-o SINGURĂ acțiune, fiindcă acțiunile de server se execută secvențial, nu în paralel.
  const bulkSeq = useRef(0);
  useEffect(() => {
    const withPart = linesRef.current.filter((l) => l.part_id);
    if (!withPart.length || !warehouseId) return;
    const my = ++bulkSeq.current;
    checkIssueMany(warehouseId, vehicleId ? Number(vehicleId) : null, withPart.map((l) => Number(l.part_id)))
      .then((byPart) => {
        if (my !== bulkSeq.current) return; // a venit prea târziu — depozitul/mașina s-au schimbat între timp
        setAlerts(Object.fromEntries(
          withPart.filter((l) => byPart[Number(l.part_id)]).map((l) => [l.uid, byPart[Number(l.part_id)] as Alert]),
        ));
      })
      .catch(() => { /* avertismentele lipsă nu blochează eliberarea */ });
    // Intenționat fără `lines` în dependențe: efectul se declanșează la schimbarea DEPOZITULUI sau a
    // MAȘINII, nu la fiecare tastă. Liniile curente se citesc din ref, ca să nu fie „înghețate" în closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, vehicleId]);

  async function submit() {
    setErr(null); setDone(null); setBusy(true);
    try {
      const r = await submitIssue({
        warehouse_id: warehouseId,
        vehicle_id: vehicleId ? Number(vehicleId) : null,
        mechanic_id: mechanicId ? Number(mechanicId) : null,
        breakdown_reason_id: reasonId ? Number(reasonId) : null,
        lines: filled.map((l) => ({ part_id: Number(l.part_id), qty: l.qty })),
        // Documentul pe care omul chiar l-a văzut pe ecran: dacă între timp apare altul, nu-l folosim pe acela.
        doc_id: today?.id ?? null,
      });
      const what = `${filled.length} ${filled.length === 1 ? 'poziție' : 'poziții'}`;
      setDone(
        (r.appended ? `Adăugat ${what} la rashodul de azi.` : `Rashod înregistrat — ${what}.`) +
        (r.shortages.length ? ' Atenție: ' + r.shortages.join('; ') : ' Stocul s-a actualizat.'),
      );
      setLines([blank()]); setAlerts({});
      // Doar panoul zilei se reîncarcă: pagina server (depozite, mașini, mecanici) nu depinde de rashod.
      await refreshToday(warehouseId, vehicleId);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <h2>Eliberare piese pe mașină</h2>
      <div className="row">
        <div className="form-row"><label>Depozit</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div className="form-row"><label>Mașina</label>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— alege mașina —</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div className="form-row"><label>Km mașină — din GPS</label>
          <input type="text" readOnly disabled value={km ? km.toLocaleString('ro-RO') + ' km' : '— alege mașina —'}
            title="Kilometrajul vine din softul GPS, nu se introduce manual" />
        </div>
      </div>

      {/* Rashodul zilei: piesele adăugate acum intră pe ACELAȘI document, nu pe unul nou. */}
      {today && (
        <div className="alert info" style={{ marginTop: 4 }}>
          <strong>Azi s-a dat deja pe această mașină</strong> ({today.positions} {today.positions === 1 ? 'poziție' : 'poziții'}
          {today.docCount > 1 ? `, în ${today.docCount} documente` : ''}) — piesele de mai jos se adaugă pe documentul #{today.id}.
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Piesă</th><th className="num">Cant.</th></tr></thead>
            <tbody>
              {today.lines.map((l, i) => (
                <tr key={`${l.partId}-${i}`}>
                  <td>{l.name}{l.article && <span className="muted"> · {l.article}</span>}</td>
                  <td className="num">{l.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {today.truncated && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Lista e prea lungă și a fost tăiată.</div>}
        </div>
      )}

      <table style={{ marginTop: 10 }}>
        <thead><tr><th>Piesă</th><th style={{ width: 110 }}>Cantitate</th><th style={{ width: 40 }}></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.uid}>
              <td>
                <SearchSelect searchFn={searchParts} value={l.part_id} selectedLabel={l.label}
                  onSelect={(o) => { setLine(i, { part_id: o ? o.id : '', label: o?.label }); checkLine(l.uid, o ? o.id : 0, warehouseId, vehicleId); }}
                  placeholder="— caută piesa (denumire, cod, articol) —" />
                {alerts[l.uid] && (
                  <div style={{ marginTop: 4 }}>
                    <span className={`badge ${alerts[l.uid].stock <= 0 ? 'warn' : 'gray'}`}>
                      stoc: {alerts[l.uid].stock}{alerts[l.uid].stock <= 0 ? ' — epuizat!' : ''}
                    </span>
                    {alerts[l.uid].alert?.messages.map((m, k) => (
                      <div key={k} className="muted" style={{ fontSize: 11, marginTop: 2 }}>{m}</div>
                    ))}
                  </div>
                )}
              </td>
              <td><input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
              <td>
                {lines.length > 1 && (
                  <button type="button" className="btn" style={{ padding: '4px 8px' }}
                    onClick={() => { setLines((ls) => ls.filter((_, j) => j !== i)); setAlerts((a) => { const n = { ...a }; delete n[l.uid]; return n; }); }}
                    title="Șterge rândul">×</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setLines((ls) => [...ls, blank()])}>+ Adaugă poziție</button>

      <div className="row" style={{ marginTop: 10 }}>
        <div className="form-row"><label>Mecanic / lăcătuș</label>
          <select value={mechanicId} onChange={(e) => setMechanicId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">—</option>{mechanics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div className="form-row"><label>Cauza defecțiunii</label>
          <select value={reasonId} onChange={(e) => setReasonId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">—</option>{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {err && <div className="alert danger">{err}</div>}
      {done && <div className="alert ok">{done}</div>}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy || !filled.length} onClick={submit}>
        {busy ? 'Se înregistrează…' : today ? `Adaugă la rashodul de azi (${filled.length})` : `Înregistrează rashod (${filled.length})`}
      </button>
    </div>
  );
}
