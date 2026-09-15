'use client';

import { useState, useRef, useMemo } from 'react';
import SearchSelect from '@/components/SearchSelect';
import { searchParts } from '../search-parts';
import { locationError, LOCATION_EXAMPLE, LOCATION_FORMAT } from '@/lib/piese-location';
import {
  startScanSession, lookupCode, scanPart, unscanPart, revealStock, finishScanSession, dropScanSession,
} from './scan-actions';

type Opt = { id: number; label: string };
type Line = { part_id: number; name: string; article: string; location_label: string; counted: number; stoc_program: number; unit: string };
type Missing = Omit<Line, 'counted'>;

const nr = (n: number) => Number(n).toLocaleString('ro-RO', { maximumFractionDigits: 3 });

export default function ScanClient({ warehouses }: { warehouses: Opt[] }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || 0);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [celula, setCelula] = useState('');
  const [cod, setCod] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [zero, setZero] = useState<Set<number>>(new Set());
  const [aratStoc, setAratStoc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  const codRef = useRef<HTMLInputElement>(null);
  // Scanerul e o tastatură: la un cititor rapid pot pleca două cereri înainte ca prima să se întoarcă, iar
  // fiecare răspuns aduce lista ÎNTREAGĂ. Fără serializare, răspunsul mai vechi ar ajunge ultimul și ar
  // șterge de pe ecran bipul mai nou — omul ar rescana, iar cantitatea ar ieși dublă.
  const coada = useRef<Promise<unknown>>(Promise.resolve());
  function laRand<T>(f: () => Promise<T>): Promise<T> {
    const next = coada.current.then(f, f);
    coada.current = next.catch(() => {});
    return next;
  }


  // Îmbină local rândul întors de server. Cât timp cifrele programului sunt ascunse, ecranul n-are nevoie de
  // nimic altceva; când sunt dezvăluite, o poziție NOUĂ n-ar avea de unde ști stocul ei, așa că atunci —
  // și numai atunci — recitim foaia. Scanarea obișnuită, cea rapidă, rămâne un singur drum dus-întors.
  function pune(p: { id: number; name: string; article: string; unit: string },
                r: { part_id: number; qty: number; location: string }) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.part_id === r.part_id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, counted: r.qty, location_label: r.location } : l));
      return [...ls, { part_id: r.part_id, name: p.name, article: p.article, unit: p.unit,
                       location_label: r.location, counted: r.qty, stoc_program: 0 }];
    });
  }
  async function resincronizeaza(sid: number) {
    const r = await revealStock(sid);
    setLines(r.lines as Line[]); setMissing(r.missing as Missing[]);
  }

  const celulaErr = celula.trim() ? locationError(celula) : null;
  const totalBucati = useMemo(() => lines.reduce((s, l) => s + Number(l.counted || 0), 0), [lines]);
  const difer = useMemo(() => lines.filter((l) => Number(l.counted) !== Number(l.stoc_program)).length, [lines]);

  async function incepe() {
    setBusy(true); setErr(null); setDone(null);
    try {
      const r = await startScanSession(warehouseId);
      setSessionId(r.sessionId); setLines(r.lines as Line[]); setMissing(r.missing as Missing[]);
      setAratStoc(false); setZero(new Set());
      // O numărătoare regăsită (începută pe terminal) vine cu rânduri: spune-o, ca omul să nu creadă că
      // reîncepe de la zero și să numere a doua oară același raft.
      if (r.lines.length) setInfo(`Am găsit numărătoarea ta neterminată: ${r.lines.length} poziții. Continuă de unde ai rămas.`);
      else setInfo(null);
      setTimeout(() => codRef.current?.focus(), 50);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function bip(codScanat: string) {
    const c = codScanat.trim();
    if (!c || sessionId == null) return;
    if (!celula.trim()) { setErr(`Pune întâi adresa celulei (${LOCATION_EXAMPLE}).`); return; }
    if (celulaErr) { setErr(`Adresa „${celula}" nu e bună: ${celulaErr}`); return; }
    setErr(null); setCod('');
    try {
      await laRand(async () => {
        const p = await lookupCode(warehouseId, c);
        if (!p) {
          // NU ghicim piesa. Un cod necunoscut care ar nimeri „cea mai apropiată" ar adăuga bucăți la
          // articolul greșit, iar diferența ar ieși la iveală peste luni, ca lipsă inexplicabilă.
          setErr(`Codul „${c}" nu e al niciunei piese. Caut-o pe nume mai jos și adaug-o cu mâna.`);
          setManual(true);
          return;
        }
        pune(p, await scanPart(sessionId, p.id, celula, null));
        if (aratStoc) await resincronizeaza(sessionId);
        setInfo(`+1 ${p.name}`);
      });
    } catch (e: any) { setErr(e.message); }
    finally { codRef.current?.focus(); }
  }

  async function adaugaManual(o: Opt | null) {
    if (!o || sessionId == null) return;
    if (!celula.trim() || celulaErr) { setErr(`Pune întâi o adresă bună (${LOCATION_EXAMPLE}).`); return; }
    setErr(null);
    try {
      await laRand(async () => {
        const r = await scanPart(sessionId, o.id, celula, null);
        pune({ id: o.id, name: o.label, article: '', unit: 'buc' }, r);
        if (aratStoc) await resincronizeaza(sessionId);
      });
      setInfo(`+1 ${o.label}`);
      setManual(false);
      setTimeout(() => codRef.current?.focus(), 50);
    } catch (e: any) { setErr(e.message); }
  }

  async function schimbaCantitate(partId: number, val: string) {
    if (sessionId == null) return;
    const q = Number(val);
    if (!Number.isFinite(q) || q < 0) return;
    const l = lines.find((x) => x.part_id === partId);
    if (!l) return;
    setErr(null);
    try {
      await laRand(async () => {
        pune({ id: partId, name: l.name, article: l.article, unit: l.unit },
             await scanPart(sessionId, partId, l.location_label || celula, q));
      });
    } catch (e: any) { setErr(e.message); }
  }

  async function scoate(partId: number) {
    if (sessionId == null) return;
    setErr(null);
    // Scoaterea rândului NU e același lucru cu „0": zero înseamnă „am căutat și nu e", iar asta înseamnă
    // „n-am numărat-o aici". A doua nu trebuie să corecteze stocul.
    try {
      await laRand(async () => {
        await unscanPart(sessionId, partId);
        setLines((ls) => ls.filter((l) => l.part_id !== partId));
        if (aratStoc) await resincronizeaza(sessionId);
      });
    } catch (e: any) { setErr(e.message); }
  }

  async function completeazaDupaProgram() {
    if (sessionId == null) return;
    setBusy(true); setErr(null);
    try {
      const r = await laRand(() => revealStock(sessionId));
      setLines(r.lines as Line[]); setMissing(r.missing as Missing[]); setAratStoc(true);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function inchide() {
    if (sessionId == null) return;
    setBusy(true); setErr(null);
    try {
      const r = await laRand(() => finishScanSession(sessionId, Array.from(zero)));
      setDone(`Gata: ${r.diffs} ${r.diffs === 1 ? 'diferență' : 'diferențe'} pe ${r.pozitii} poziții, ${r.adrese} adrese fixate${r.zerouri ? `, ${r.zerouri} trecute la zero` : ''}. Document nr. ${r.doc_id}.`);
      setSessionId(null); setLines([]); setMissing([]); setZero(new Set()); setAratStoc(false); setInfo(null);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function renunta() {
    if (sessionId == null) return;
    if (!confirm('Renunți la numărătoare? Tot ce ai scanat se pierde, stocul rămâne neschimbat.')) return;
    setBusy(true); setErr(null);
    try {
      await laRand(() => dropScanSession(sessionId));
      setSessionId(null); setLines([]); setMissing([]); setZero(new Set()); setAratStoc(false); setInfo(null);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (sessionId == null) {
    return (
      <div className="card" style={{ maxWidth: 720 }}>
        <h2>Numărare cu scanerul</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Iei o celulă, îi scrii adresa o dată, apoi scanezi tot ce e în ea. Adresa rămâne până o schimbi tu.
          Numărătoarea se salvează pe măsură ce scanezi: poți începe pe terminal și termina la calculator.
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="form-row"><label>Depozit</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={incepe} disabled={busy || !warehouseId} style={{ alignSelf: 'flex-end' }}>
            {busy ? 'Se deschide…' : 'Începe / continuă numărătoarea'}
          </button>
        </div>
        {err && <div className="alert error" style={{ marginTop: 10 }}>{err}</div>}
        {done && <div className="alert ok" style={{ marginTop: 10 }}>{done}</div>}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div className="form-row" style={{ minWidth: 170 }}>
          <label>Celula curentă</label>
          <input value={celula} onChange={(e) => setCelula(e.target.value)} placeholder={LOCATION_EXAMPLE}
            style={{ fontSize: 18, fontWeight: 600 }} />
        </div>
        <div className="form-row" style={{ flex: 1, minWidth: 220 }}>
          <label>Scanează codul</label>
          <input ref={codRef} value={cod} onChange={(e) => setCod(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); bip(cod); } }}
            placeholder={celula.trim() ? 'bip…' : 'întâi adresa celulei'}
            disabled={!celula.trim() || !!celulaErr} style={{ fontSize: 18 }} />
        </div>
        <div style={{ paddingBottom: 6 }}>
          <strong style={{ fontSize: 18 }}>{lines.length}</strong>{' '}
          <span className="muted">poziții · {nr(totalBucati)} buc</span>
        </div>
      </div>
      {celulaErr && <div className="alert warn" style={{ marginTop: 8 }}>Adresa nu e bună ({LOCATION_FORMAT}): {celulaErr}</div>}
      {err && <div className="alert error" style={{ marginTop: 8 }}>{err}</div>}
      {info && !err && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{info}</div>}

      {manual && (
        <div style={{ marginTop: 10, maxWidth: 520 }}>
          {/* Butonul stă DEASUPRA căutării, nu sub ea: lista derulantă se deschide singură (autoFocus) și
              acoperea exact locul în care ar fi fost, lăsând omul blocat în căutare fără cale de întoarcere. */}
          <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <label className="muted" style={{ fontSize: 12 }}>Adaugă pe nume (piesa n-are cod de bare)</label>
            <button type="button" className="btn" style={{ padding: '3px 10px', fontSize: 12 }}
              onClick={() => { setManual(false); codRef.current?.focus(); }}>Înapoi la scanare</button>
          </div>
          <SearchSelect value="" searchFn={searchParts} onSelect={adaugaManual} placeholder="— caută piesa —" autoFocus />
        </div>
      )}

      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Piesa</th>
            <th style={{ width: 110 }}>Celula</th>
            <th style={{ width: 110 }}>Numărat</th>
            {aratStoc && <th style={{ width: 100 }}>În program</th>}
            {aratStoc && <th style={{ width: 100 }}>Diferență</th>}
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const d = Number(l.counted) - Number(l.stoc_program);
            return (
              <tr key={l.part_id}>
                <td>{l.name}{l.article ? <span className="muted"> · {l.article}</span> : null}</td>
                <td>{l.location_label}</td>
                <td>
                  <input type="number" min={0} step="any" defaultValue={l.counted} key={`${l.part_id}:${l.counted}`}
                    aria-label={`Cantitate numărată pentru ${l.name}`}
                    onBlur={(e) => { if (Number(e.target.value) !== Number(l.counted)) schimbaCantitate(l.part_id, e.target.value); }}
                    style={{ width: 90 }} />
                </td>
                {aratStoc && <td>{nr(l.stoc_program)} {l.unit}</td>}
                {aratStoc && <td style={{ color: d === 0 ? undefined : d > 0 ? '#0a7' : '#c33', fontWeight: d === 0 ? undefined : 600 }}>
                  {d === 0 ? '—' : (d > 0 ? '+' : '') + nr(d)}
                </td>}
                <td>
                  <button type="button" className="btn" style={{ padding: '2px 8px' }} title="Scoate rândul din numărătoare"
                    onClick={() => scoate(l.part_id)}>×</button>
                </td>
              </tr>
            );
          })}
          {!lines.length && <tr><td colSpan={aratStoc ? 6 : 4} className="muted">Încă n-ai scanat nimic.</td></tr>}
        </tbody>
      </table>

      {aratStoc && missing.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 4 }}>{missing.length === 1 ? 'În celulele pe care le-ai umblat mai este o piesă' : `În celulele pe care le-ai umblat mai sunt ${missing.length} piese`}</h3>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            Programul {missing.length === 1 ? 'o crede' : 'le crede'} exact în celulele scanate de tine, dar
            nu {missing.length === 1 ? 'ai scanat-o' : 'le-ai scanat'}. <strong>Nu {missing.length === 1 ? 'o trec' : 'le trec'} singur la
            zero</strong> — bifează doar ce ai căutat și chiar nu e. Ce lași nebifat rămâne neatins.
          </p>
          <table>
            <thead><tr><th style={{ width: 40 }}></th><th>Piesa</th><th style={{ width: 110 }}>Celula</th><th style={{ width: 110 }}>În program</th></tr></thead>
            <tbody>
              {missing.map((m) => (
                <tr key={m.part_id}>
                  <td><input type="checkbox" checked={zero.has(m.part_id)} aria-label={`Trece la zero ${m.name}`}
                    onChange={(e) => setZero((s) => { const n = new Set(s); if (e.target.checked) n.add(m.part_id); else n.delete(m.part_id); return n; })} /></td>
                  <td>{m.name}{m.article ? <span className="muted"> · {m.article}</span> : null}</td>
                  <td>{m.location_label}</td>
                  <td>{nr(m.stoc_program)} {m.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ marginTop: 14, gap: 10, alignItems: 'center' }}>
        {!aratStoc
          ? <button className="btn" onClick={completeazaDupaProgram} disabled={busy || !lines.length}>
              Completează după program
            </button>
          : <strong>{difer} {difer === 1 ? 'diferență' : 'diferențe'}{zero.size ? ` + ${zero.size} trecute la zero` : ''}</strong>}
        <button className="btn btn-primary" onClick={inchide} disabled={busy || (!lines.length && !zero.size)}>
          {busy ? 'Se închide…' : 'Închide numărătoarea'}
        </button>
        <button className="btn" onClick={renunta} disabled={busy}>Renunță</button>
      </div>

      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
        Cifrele programului apar abia la „Completează după program" — ca să numeri ce vezi, nu ce scrie
        programul. Până închizi, nimic nu s-a mișcat din stoc.
      </p>
    </div>
  );
}
