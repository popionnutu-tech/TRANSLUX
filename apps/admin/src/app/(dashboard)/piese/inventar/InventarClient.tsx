'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadSheet, saveInventory } from './actions';
import PieseDepotMap from '@/components/PieseDepotMap';

interface Opt { id: number; label: string }
interface Row {
  part_id: number; label: string; current: number; counted: number;
  section: string; rack: string; shelf: string; cell: string; location: string; placed: boolean;
}

export default function InventarClient({ warehouses }: { warehouses: Opt[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || 0);
  const [rows, setRows] = useState<Row[]>([]);
  const [layout, setLayout] = useState<any>(null);
  const [section, setSection] = useState('');
  // Filtru pe RÂND în interiorul stelajului: la o „inventariere mică" (câteva rafturi pe zi) stelajul
  // întreg e prea mult — un om numără un rând, nu o secție.
  const [rack, setRack] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'danger'; m: string } | null>(null);

  async function load() {
    setBusy(true); setMsg(null);
    const sheet = await loadSheet(warehouseId);
    setRows(sheet.rows.map((s: any) => ({ ...s, counted: s.current })));
    setLayout(sheet.layout); setSection(''); setLoaded(true); setBusy(false);
  }
  async function submit() {
    setBusy(true); setMsg(null);
    try {
      // Zonare (inventar concurent): salvăm DOAR diferențele din secția selectată (mod echipă) → 2-3 echipe pe
      // același depozit nu se pot suprascrie. „Tot depozitul" (section='') comite toate diferențele (supervizor / 1 echipă).
      const savedSection = section;
      const savedRack = rack;
      // Eticheta zonei salvate — apare în mesaje, ca omul să vadă exact ce s-a comis.
      const zone = savedSection ? `stelajul ${savedSection}${savedRack ? `, rândul ${savedRack}` : ''}` : '';
      // `visible` (definit la render) e deja „secția selectată SAU tot depozitul" — o singură sursă comună cu butonul/`scopeDiffs`.
      const counts = visible.filter((r) => r.counted !== r.current).map((r) => ({ part_id: r.part_id, counted_qty: r.counted }));
      if (!counts.length) { setMsg({ t: 'ok', m: zone ? `Nicio diferență în ${zone}.` : 'Nicio diferență — totul se potrivește.' }); setBusy(false); return; }
      // Cantitățile ÎN CURS din TOATE stelajele, capturate înainte de reîncărcare — ca un operator care numără mai
      // multe stelaje pe același ecran să NU-și piardă munca nesalvată când salvează un singur stelaj.
      const pending = new Map(rows.filter((r) => r.counted !== r.current).map((r) => [r.part_id, r.counted] as const));
      const res = await saveInventory(warehouseId, counts);
      setMsg({ t: 'ok', m: `Inventariere salvată${zone ? ` — ${zone}` : ''}: ${res.diffs} diferențe corectate (ca mișcări, fără ștergeri).` });
      // Reîncarc stocul proaspăt (secția salvată reflectă noul stoc), DAR re-aplic cantitățile în curs din CELELALTE
      // stelaje (nesalvate). Rămân pe stelajul curent (nu resetez la „tot depozitul"), ca fluxul pe echipă să curgă.
      const sheet = await loadSheet(warehouseId);
      setRows(sheet.rows.map((s: any) => {
        // Se păstrează numărătorile nesalvate din TOT ce n-a fost comis acum — inclusiv celelalte RÂNDURI
        // ale aceluiași stelaj. Cu verificarea doar pe secție, o salvare pe rândul A-12 ștergea munca
        // nesalvată de pe A-13, deși nu s-a atins.
        const inSavedZone = savedSection
          ? s.section === savedSection && (!savedRack || s.rack === savedRack)
          : true;
        const keepPending = !inSavedZone;
        const p = pending.get(s.part_id);
        return { ...s, counted: keepPending && p !== undefined ? p : s.current };
      }));
      setLayout(sheet.layout);
      router.refresh();
    } catch (e: any) { setMsg({ t: 'danger', m: e.message }); } finally { setBusy(false); }
  }

  const sections: string[] = Array.from(new Set(rows.filter((r) => r.placed).map((r) => r.section))).sort();
  const racks: string[] = section
    ? Array.from(new Set(rows.filter((r) => r.placed && r.section === section).map((r) => r.rack))).sort(
        (a, b) => { const x = Number(a), y = Number(b); return (isNaN(x) || isNaN(y)) ? a.localeCompare(b) : x - y; })
    : [];
  const visible = rows.filter((r) =>
    (!section || r.section === section) && (!rack || r.rack === rack));
  const unplaced = rows.filter((r) => !r.placed).length;
  const diffCount = rows.filter((r) => r.counted !== r.current).length;        // total, tot depozitul
  const scopeDiffs = visible.filter((r) => r.counted !== r.current).length;     // doar ce se va comite (secția curentă)
  const otherDiffs = diffCount - scopeDiffs;                                    // diferențe rămase pe alte stelaje

  return (
    <>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="form-row"><label>Depozit de numărat</label><select value={warehouseId} onChange={(e) => { setWarehouseId(Number(e.target.value)); setLoaded(false); }}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
          <button className="btn btn-primary" disabled={busy} onClick={load}>Deschide foaia de numărare</button>
        </div>
        {msg && <div className={`alert ${msg.t}`} style={{ marginTop: 12, marginBottom: 0 }}>{msg.m}</div>}
      </div>
      {loaded && layout && (
        <>
          <div className="card">
            <h2>Alege stelajul de numărat azi</h2>
            <div className="pill-row" style={{ marginBottom: 14 }}>
              <button className={`btn${section === '' ? ' btn-primary' : ''}`} onClick={() => setSection('')} style={{ padding: '7px 14px' }}>Tot depozitul</button>
              {sections.map((s) => <button key={s} className={`btn${section === s ? ' btn-primary' : ''}`} onClick={() => { setSection(s); setRack(''); }} style={{ padding: '7px 14px' }}>Stelajul {s}</button>)}
            </div>
            {/* Al doilea nivel de filtrare — rândul. Apare doar după ce s-a ales un stelaj, ca să nu
                încarce ecranul degeaba. */}
            {section && racks.length > 1 && (
              <div className="pill-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <button className={`btn${rack === '' ? ' btn-primary' : ''}`} onClick={() => setRack('')} style={{ padding: '5px 11px', fontSize: 13 }}>Tot stelajul</button>
                {racks.map((rk) => <button key={rk} className={`btn${rack === rk ? ' btn-primary' : ''}`} onClick={() => setRack(rk)} style={{ padding: '5px 11px', fontSize: 13 }}>Rândul {rk}</button>)}
              </div>
            )}
            {unplaced > 0 && !section && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                {unplaced} {unplaced === 1 ? 'piesă are stoc dar n-are adresă' : 'piese au stoc dar n-au adresă'} —
                sunt la sfârșitul listei. Pune-le locația din Catalog, ca să intre în hartă și în drumul de numărare.
              </p>
            )}
            <PieseDepotMap layout={layout} highlightSection={section || null} />
          </div>
          <div className="card">
            <h2>{section ? `Foaie — stelajul ${section}${rack ? `, rândul ${rack}` : ''}` : 'Foaie — tot depozitul'} <span className="muted" style={{ fontWeight: 400 }}>({visible.length} poziții)</span></h2>
            <table>
              <thead><tr><th>Rând</th><th>Piesă</th><th className="num">În program</th><th className="num" style={{ width: 150 }}>Numărat faptic</th><th className="num">Diferență</th></tr></thead>
              <tbody>
                {visible.map((r) => {
                  const idx = rows.indexOf(r); const d = r.counted - r.current;
                  return (
                    <tr key={r.part_id}>
                      {/* Adresa COMPLETĂ, nu doar stelaj-rând: exact ce trebuie ca să pui mâna pe piesă. */}
                      <td>{r.placed
                        ? <span className="badge gray" style={{ fontFamily: 'monospace' }}>{r.location}</span>
                        : <span className="badge warn">fără adresă</span>}</td>
                      <td>{r.label}</td>
                      <td className="num">{r.current}</td>
                      <td className="num"><input type="number" value={r.counted} onChange={(e) => setRows((rs) => rs.map((x, j) => j === idx ? { ...x, counted: Number(e.target.value) } : x))} style={{ textAlign: 'right' }} /></td>
                      <td className="num">{d === 0 ? <span className="muted">0</span> : <span className={`badge ${d > 0 ? 'info' : 'warn'}`}>{d > 0 ? '+' : ''}{d}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>Salvează inventarierea ({scopeDiffs} {scopeDiffs === 1 ? 'diferență' : 'diferențe'} {section ? `în stelajul ${section}${rack ? `, rândul ${rack}` : ''}` : 'în tot depozitul'})</button>
            {section && otherDiffs > 0 && <p className="muted" style={{ marginTop: 8, marginBottom: 0, textAlign: 'center' }}>Ai {otherDiffs} {otherDiffs === 1 ? 'diferență' : 'diferențe'} și în afara zonei curente — comută pe fiecare stelaj și salvează separat (așa nu atingi zona altei echipe).</p>}
          </div>
        </>
      )}
    </>
  );
}
