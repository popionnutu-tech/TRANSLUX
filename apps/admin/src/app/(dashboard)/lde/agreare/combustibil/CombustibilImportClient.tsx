'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  legaPortofel, confirmaPropunerile, adaugaRezerva, inchideRezerva, stergeRezerva, legaRandManual, getRanduriCod,
  marcheazaDublura, anuleazaImport, salveazaStatie,
  type CombustibilData, type Portofel, type RandDeLegat,
} from './actions';

// Macheta revizorului ux-clava (plan 2026-10-08): încărcare → rezumat → «De legat» pe card/portofel → rezerve → foile LDE
// pe care fișierul nu le acoperă → istoricul. Stil ca pagina normelor (alb + bordo, inline — resetul CSS bate Tailwind).

const BORDO = 'var(--primary, #9B1B30)';
const MAX = 4 * 1024 * 1024;
const TIPURI: [Portofel['tip'] & string, string][] = [
  ['sofer', 'Șofer'], ['masina', 'Mașină'], ['grup', 'Grup (GPS)'], ['rezerva', 'Rezervă'], ['strain', 'În afara flotei'],
];
const SURSA: Record<string, string> = { petrom: 'Petrom', intelect: 'Intelect' };
const nr = (x: number | null | undefined, z = 0) => (x == null ? '—' : x.toLocaleString('ro-RO', { minimumFractionDigits: z, maximumFractionDigits: z }));
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '…');

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 'var(--radius, 24px)', padding: '12px 16px', boxShadow: '0 8px 40px rgba(155,27,48,0.08), 0 1px 3px rgba(0,0,0,0.04)' };
const camp: React.CSSProperties = { padding: '4px 6px', border: '1px solid rgba(155,27,48,0.25)', borderRadius: 8, fontSize: 12.5, background: '#fff', minHeight: 30, maxWidth: '100%' };
const btn = (on = false): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 999, fontSize: 12.5, minHeight: 30, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${on ? BORDO : 'rgba(155,27,48,0.25)'}`, background: on ? BORDO : '#fff', color: on ? '#fff' : '#333', fontWeight: on ? 600 : 400,
});
const h2: React.CSSProperties = { margin: 0, fontSize: 17, fontWeight: 500, color: BORDO };
const mic: React.CSSProperties = { fontSize: 12, color: '#777' };

function useActiune() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [eroare, setEroare] = useState<string | null>(null);
  const run = (f: () => Promise<unknown>, dupa?: () => void) => {
    setEroare(null);
    start(async () => { try { await f(); dupa?.(); router.refresh(); } catch (e) { setEroare(e instanceof Error ? e.message : String(e)); } });
  };
  return { pending, eroare, run };
}

function Incarcare() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [stare, setStare] = useState<{ ok?: string; err?: string; pending?: boolean }>({});
  const trimite = async () => {
    const f = ref.current?.files?.[0];
    if (!f) { setStare({ err: 'Alege fișierul (Petrom .txt sau Intelect .xls)' }); return; }
    if (f.size > MAX) { setStare({ err: 'Fișierul e mai mare de 4 MB — e chiar raportul lunar?' }); return; }
    setStare({ pending: true });
    const fd = new FormData(); fd.append('fisier', f);
    try {
      const r = await fetch('/lde/agreare/combustibil/incarca', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({ error: 'Răspuns neașteptat de la server' }));
      if (!r.ok) { setStare({ err: j.error ?? `Eroare ${r.status}` }); return; }
      setStare({ ok: `${SURSA[j.sursa]} ${ddmm(j.de)}–${ddmm(j.pana)}: ${nr(j.randuri)} alimentări, ${nr(j.litri_dt, 2)} l motorină · noi ${nr(j.rezultat?.randuri_noi)}` });
      if (ref.current) ref.current.value = '';
      router.refresh();
    } catch (e) { setStare({ err: e instanceof Error ? e.message : String(e) }); }
  };
  return (
    <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <b style={{ fontSize: 14 }}>Încarcă fișierul</b>
      <input ref={ref} type="file" accept=".txt,.xls" aria-label="Fișierul Petrom (.txt) sau Intelect (.xls)" style={{ fontSize: 13, maxWidth: '100%' }} />
      <button type="button" onClick={trimite} disabled={stare.pending} style={btn(true)}>{stare.pending ? 'Se încarcă…' : 'Încarcă'}</button>
      <span style={mic}>Raportul Petrom (.txt) sau raportul Intelect «Оборот по кошелькам…» (.xls), cel mult 4 MB.</span>
      {stare.ok && <div style={{ flexBasis: '100%', color: '#15803d', fontSize: 13 }}>✓ {stare.ok}</div>}
      {stare.err && <div style={{ flexBasis: '100%', color: '#b91c1c', fontSize: 13 }}>{stare.err}</div>}
    </div>
  );
}

function RandPortofel({ p, data }: { p: Portofel; data: CombustibilData }) {
  const { pending, eroare, run } = useActiune();
  const [tip, setTip] = useState<string>(p.tip ?? (p.propus_vehicle_id ? 'masina' : ''));
  const [veh, setVeh] = useState(p.vehicle_id ?? p.propus_vehicle_id ?? '');
  const [drv, setDrv] = useState(p.driver_id ?? '');
  const [lde, setLde] = useState(p.nume_lde ?? '');
  const [cat, setCat] = useState(p.categorie ?? '');
  const [deschis, setDeschis] = useState(false);
  const [randuri, setRanduri] = useState<RandDeLegat[] | null>(null);
  const salveaza = () => run(() => legaPortofel(p.sursa, p.cod, (tip || null) as Portofel['tip'], { vehicle_id: veh, driver_id: drv, nume_lde: lde, categorie: cat }));
  const arata = () => {
    const n = !deschis; setDeschis(n);
    if (n) run(async () => setRanduri(await getRanduriCod(p.sursa, p.cod)));
  };
  return (
    <div style={{ borderBottom: '1px solid rgba(155,27,48,0.06)', padding: '8px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={arata} aria-label="Tranzacțiile cardului" style={{ border: 0, background: 'transparent', color: BORDO, cursor: 'pointer', width: 22 }}>{deschis ? '▾' : '▸'}</button>
        <span style={{ minWidth: 180 }}>
          <b>{p.cod}</b> <span style={mic}>{SURSA[p.sursa]}</span><br />
          <span style={{ fontSize: 12 }}>{p.nume_fisier}</span>
        </span>
        <span style={{ ...mic, minWidth: 140 }}>
          {nr(p.tranzactii)} alimentări · {nr(p.litri)} l
          {p.de_legat > 0 && <><br /><span style={{ color: '#b45309' }}>de legat: {nr(p.de_legat)} ({nr(p.litri_de_legat)} l){p.motiv ? ` — ${p.motiv}` : ''}</span></>}
        </span>
        <select value={tip} onChange={(e) => setTip(e.target.value)} aria-label="Ce reprezintă cardul" style={camp}>
          <option value="">— alege —</option>
          {TIPURI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        {tip === 'masina' && (
          <select value={veh} onChange={(e) => setVeh(e.target.value)} aria-label="Mașina" style={camp}>
            <option value="">mașina…</option>
            {data.vehicule.map((v) => <option key={v.id} value={v.id}>{v.nume}{v.id === p.propus_vehicle_id ? ' (propusă)' : ''}</option>)}
          </select>
        )}
        {tip === 'sofer' && (
          <>
            <select value={drv} onChange={(e) => setDrv(e.target.value)} aria-label="Șoferul" style={camp}>
              <option value="">șoferul…</option>
              {data.soferi.map((d) => <option key={d.id} value={d.id}>{d.nume}</option>)}
            </select>
            <input list="nume-lde" value={lde} onChange={(e) => setLde(e.target.value)} placeholder="numele lui pe foaia LDE" aria-label="Numele șoferului pe foaia LDE" style={{ ...camp, width: 190 }} />
          </>
        )}
        {tip === 'strain' && <input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="ce e (ex. consum intern)" aria-label="Ce e" style={{ ...camp, width: 180 }} />}
        {tip === 'rezerva' && <span style={mic}>perioadele — în «Rezerve» mai jos</span>}
        {tip === 'grup' && <span style={mic}>mașina se ia din GPS, la stație</span>}
        <button type="button" disabled={pending} onClick={salveaza} style={btn(true)}>Salvează</button>
        {eroare && <span style={{ color: '#b91c1c', fontSize: 12 }}>{eroare}</span>}
      </div>
      {deschis && (
        <div style={{ padding: '6px 0 4px 30px', fontSize: 12.5 }}>
          {!randuri && <span style={mic}>Se încarcă…</span>}
          {randuri && !randuri.length && <span style={mic}>Toate alimentările acestui card sunt legate.</span>}
          {randuri?.map((r) => <RandManual key={r.external_id} r={r} data={data} />)}
        </div>
      )}
    </div>
  );
}

function RandManual({ r, data }: { r: RandDeLegat; data: CombustibilData }) {
  const { pending, eroare, run } = useActiune();
  const [veh, setVeh] = useState(r.vehicle_id ?? '');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '2px 0' }}>
      <span style={{ minWidth: 150 }}>{r.local} · <b>{nr(r.litri, 2)} l</b></span>
      <span style={{ ...mic, minWidth: 160 }}>{r.statie ?? ''}{r.motiv ? ` — ${r.motiv}` : ''}</span>
      <select value={veh} onChange={(e) => setVeh(e.target.value)} aria-label="Mașina acestei alimentări" style={camp}>
        <option value="">mașina…</option>
        {data.vehicule.map((v) => <option key={v.id} value={v.id}>{v.nume}</option>)}
      </select>
      <button type="button" disabled={pending || !veh} onClick={() => run(() => legaRandManual(r.external_id, { vehicle_id: veh }))} style={btn()}>Pune pe mașină</button>
      <button type="button" disabled={pending} onClick={() => run(() => legaRandManual(r.external_id, { strain: true }))} style={btn()}>În afara flotei</button>
      {eroare && <span style={{ color: '#b91c1c', fontSize: 12 }}>{eroare}</span>}
    </div>
  );
}

function Rezerve({ data }: { data: CombustibilData }) {
  const { pending, eroare, run } = useActiune();
  const coduri = data.portofele.filter((p) => p.tip === 'rezerva');
  const [cod, setCod] = useState(coduri[0] ? `${coduri[0].sursa}|${coduri[0].cod}` : '');
  const [de, setDe] = useState(''); const [pana, setPana] = useState('');
  const [cine, setCine] = useState<'masina' | 'sofer' | 'persoana'>('masina');
  const [val, setVal] = useState(''); const [nota, setNota] = useState('');
  const adauga = () => {
    const [s, c] = cod.split('|');
    run(() => adaugaRezerva(s as 'petrom' | 'intelect', c, de, pana || null,
      cine === 'masina' ? { vehicle_id: val } : cine === 'sofer' ? { driver_id: val } : { persoana_text: val }, nota),
    () => { setVal(''); setNota(''); });
  };
  const numeVeh = useMemo(() => new Map(data.vehicule.map((v) => [v.id, v.nume])), [data.vehicule]);
  const numeDrv = useMemo(() => new Map(data.soferi.map((d) => [d.id, d.nume])), [data.soferi]);
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={h2}>Rezerve</h2>
      <span style={mic}>Cine a avut cardul de rezervă și când. La o urgență, schimbi doar alimentarea aceea (▸ pe card).</span>
      {!coduri.length && <span style={mic}>Niciun card marcat «Rezervă» încă — alege tipul la card, mai sus.</span>}
      {data.rezerve.map((r) => (
        <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          <b style={{ minWidth: 70 }}>{r.cod}</b>
          <span style={{ minWidth: 170 }}>{r.vehicle_id ? numeVeh.get(r.vehicle_id) : r.driver_id ? numeDrv.get(r.driver_id) : r.persoana_text}</span>
          <span style={mic}>{ddmm(r.de)} – {r.pana ? ddmm(r.pana) : 'în curs'}{r.nota ? ` · ${r.nota}` : ''}</span>
          {!r.pana && <button type="button" disabled={pending} onClick={() => { const z = prompt('Până la ce dată (AAAA-LL-ZZ)?'); if (z) run(() => inchideRezerva(r.id, z)); }} style={btn()}>Închide</button>}
          <button type="button" disabled={pending} onClick={() => run(() => stergeRezerva(r.id))} style={btn()}>Șterge</button>
        </div>
      ))}
      {coduri.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid rgba(155,27,48,0.08)' }}>
          <select value={cod} onChange={(e) => setCod(e.target.value)} aria-label="Cardul de rezervă" style={camp}>
            {coduri.map((p) => <option key={`${p.sursa}|${p.cod}`} value={`${p.sursa}|${p.cod}`}>{p.cod} · {p.nume_fisier}</option>)}
          </select>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De la" style={camp} />
          <input type="date" value={pana} onChange={(e) => setPana(e.target.value)} aria-label="Până la (gol = în curs)" style={camp} />
          <select value={cine} onChange={(e) => { setCine(e.target.value as typeof cine); setVal(''); }} aria-label="Cine" style={camp}>
            <option value="masina">mașina</option><option value="sofer">șoferul</option><option value="persoana">persoană din afara flotei</option>
          </select>
          {cine === 'masina' && <select value={val} onChange={(e) => setVal(e.target.value)} aria-label="Mașina" style={camp}><option value="">mașina…</option>{data.vehicule.map((v) => <option key={v.id} value={v.id}>{v.nume}</option>)}</select>}
          {cine === 'sofer' && <select value={val} onChange={(e) => setVal(e.target.value)} aria-label="Șoferul" style={camp}><option value="">șoferul…</option>{data.soferi.map((d) => <option key={d.id} value={d.id}>{d.nume}</option>)}</select>}
          {cine === 'persoana' && <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="cine" aria-label="Persoana" style={{ ...camp, width: 160 }} />}
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="notă (opțional)" aria-label="Notă" style={{ ...camp, width: 160 }} />
          <button type="button" disabled={pending || !de || !val} onClick={adauga} style={btn(true)}>Adaugă perioada</button>
        </div>
      )}
      {eroare && <span style={{ color: '#b91c1c', fontSize: 12 }}>{eroare}</span>}
    </div>
  );
}

function Statii({ data }: { data: CombustibilData }) {
  const { pending, eroare, run } = useActiune();
  const salvate = new Map(data.statii.map((s) => [`${s.sursa}|${s.nume_fisier}`, s]));
  const [val, setVal] = useState<Record<string, string>>({});
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h2 style={h2}>Stațiile (doar Ion)</h2>
      <span style={mic}>Pentru cardurile de grup softul caută pe GPS mașina care era la stație. Fără coordonate verificate, alimentarea rămâne «de legat». Format: 47.2345, 27.8123</span>
      {data.statiiVazute.map((s) => {
        const k = `${s.sursa}|${s.nume_fisier}`; const sv = salvate.get(k);
        return (
          <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ minWidth: 220 }}>{s.nume_fisier} <span style={mic}>{SURSA[s.sursa]}</span></span>
            <input value={val[k] ?? (sv?.lat != null ? `${sv.lat}, ${sv.lon}` : '')} onChange={(e) => setVal({ ...val, [k]: e.target.value })}
              placeholder="lat, lon" aria-label={`Coordonatele stației ${s.nume_fisier}`} style={{ ...camp, width: 190 }} />
            <button type="button" disabled={pending} onClick={() => {
              const [la, lo] = (val[k] ?? '').split(',').map((x) => Number(x.trim()));
              run(() => salveazaStatie(s.sursa, s.nume_fisier, la, lo));
            }} style={btn()}>Salvează</button>
            {sv?.confirmat && <span style={{ color: '#15803d', fontSize: 12 }}>✓</span>}
          </div>
        );
      })}
      {eroare && <span style={{ color: '#b91c1c', fontSize: 12 }}>{eroare}</span>}
    </div>
  );
}

export default function CombustibilImportClient({ data }: { data: CombustibilData }) {
  const { pending, eroare, run } = useActiune();
  const deLegat = data.portofele.filter((p) => p.tip == null || p.de_legat > 0).sort((a, b) => b.litri - a.litri);
  const legate = data.portofele.filter((p) => !(p.tip == null || p.de_legat > 0));
  const propuneri = data.portofele.filter((p) => p.tip == null && p.propus_vehicle_id).length;
  const [toate, setToate] = useState(false);
  const [confirmAnulare, setConfirmAnulare] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
      <datalist id="nume-lde">{data.numeLde.map((n) => <option key={n} value={n} />)}</datalist>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 400, color: BORDO }}>Combustibil din fișiere</h1>
        <div style={mic}>Petrom și Intelect · fișierul devine sursa: foile LDE ale acelorași alimentări nu se mai numără · <Link href="/lde/agreare/norme" style={{ color: BORDO }}>normele lunii</Link></div>
      </div>

      <Incarcare />

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={h2}>De legat {deLegat.length ? `· ${deLegat.length} carduri` : ''}</h2>
          {propuneri > 0 && <button type="button" disabled={pending} onClick={() => run(() => confirmaPropunerile())} style={btn(true)}>Confirmă toate propunerile ({propuneri})</button>}
        </div>
        <span style={mic}>Un card se leagă o dată. «Propusă» = mașina găsită după plăcuța din fișier. Numele de persoane nu se leagă singure.</span>
        {!deLegat.length && <span style={{ color: '#15803d' }}>✓ Toate cardurile sunt legate.</span>}
        {deLegat.map((p) => <RandPortofel key={`${p.sursa}|${p.cod}`} p={p} data={data} />)}
        {eroare && <span style={{ color: '#b91c1c', fontSize: 12 }}>{eroare}</span>}
        {legate.length > 0 && (
          <button type="button" onClick={() => setToate(!toate)} style={{ ...btn(), alignSelf: 'flex-start', marginTop: 6 }}>{toate ? 'Ascunde' : 'Arată'} cardurile legate ({legate.length})</button>
        )}
        {toate && legate.map((p) => <RandPortofel key={`${p.sursa}|${p.cod}`} p={p} data={data} />)}
      </div>

      <Rezerve data={data} />

      {data.pesteFisier.length > 0 && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={h2}>În LDE peste fișier</h2>
          <span style={mic}>Pe foaia LDE sunt mai mulți litri decât în fișier în ziua aceea (±1 zi). Restul rămâne numărat — de obicei e o alimentare la altă stație. Dacă e o greșeală pe foaie, apasă «E dublură».</span>
          {data.pesteFisier.map((x) => (
            <div key={`${x.vehicle_id}|${x.zi}|${x.sursa}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ minWidth: 80 }}>{x.m}</b><span style={{ minWidth: 60 }}>{ddmm(x.zi)}</span>
              <span style={{ ...mic, minWidth: 230 }}>{SURSA[x.sursa]}: foaie {nr(x.foaie_l, 2)} l, din fișier {nr(x.acoperit, 2)} l → rest {nr(x.rest, 2)} l</span>
              <button type="button" disabled={pending} onClick={() => run(() => marcheazaDublura(x.vehicle_id, x.zi, x.sursa))} style={btn()}>E dublură</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={h2}>Încărcări</h2>
        {!data.importuri.length && <span style={mic}>Nimic încărcat încă.</span>}
        {data.importuri.map((i) => (
          <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: i.anulat_la ? 0.5 : 1 }}>
            <b style={{ minWidth: 70 }}>{SURSA[i.sursa]}</b>
            <span style={{ minWidth: 110 }}>{ddmm(i.de)}–{ddmm(i.pana)}</span>
            <span style={{ ...mic, minWidth: 220 }}>{nr(i.randuri)} alimentări · {nr(Number(i.litri_dt), 2)} l motorină · {i.incarcat_de.split('@')[0]}, {new Date(i.incarcat_la).toLocaleDateString('ro-RO')}</span>
            {i.anulat_la ? <span style={mic}>anulată</span>
              : confirmAnulare === i.id
                ? <><span style={{ color: '#b45309' }}>Sigur? Litrii lui ies din consum, foile LDE revin.</span>
                    <button type="button" disabled={pending} onClick={() => run(() => anuleazaImport(i.id), () => setConfirmAnulare(null))} style={btn(true)}>Da, anulează</button>
                    <button type="button" onClick={() => setConfirmAnulare(null)} style={btn()}>Nu</button></>
                : <button type="button" onClick={() => setConfirmAnulare(i.id)} style={btn()}>Anulează</button>}
          </div>
        ))}
      </div>

      {data.esteAdmin && data.statiiVazute.length > 0 && <Statii data={data} />}
    </div>
  );
}
