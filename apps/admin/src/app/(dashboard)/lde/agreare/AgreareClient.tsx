'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { salveazaAgreare, type AgreareData, type Agreat, type RandAgreare, type SoferOpt } from './actions';

// Agrearea lunară a șoferilor (ION-174), după macheta aprobată de Ion pe 02.10.2026: un rând pe mașină, nopțile din GPS
// (localitate + zilele), șoferii agreați cu perioada «de la – până la» și banda zilelor lunii; «+» adaugă din lista uzinei.

const UZINE = ['Toate', 'Drăxlmaier', 'SEBN', 'LEAR Ungheni', 'LEAR Florești'];
const STARI: [string, string][] = [['toate', 'Toate'], ['de agreat', 'Fără șofer'], ['alt sat', 'Doarme în alt sat'], ['agreată', 'Agreate']];
const BORDO = 'var(--primary, #9B1B30)';
const LUNI_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

const normLoc = (s: string | null | undefined): string[] => {
  if (!s) return [];
  const n = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const m = s.split('/')[0].match(/^(.*?)\s*\((.*?)\)\s*$/);
  return (m ? [n(m[1]), n(m[2])] : [n(s.split('/')[0])]).filter(Boolean);
};
const suprapus = (a: string[], b: string[]) => a.some((x) => b.includes(x));

function etichetaLuna(luna: string): string {
  const [y, m] = luna.split('-').map(Number);
  return `${LUNI_RO[m - 1]} ${y}`;
}
function luniDisponibile(luna: string): string[] {
  const out = new Set<string>([luna]);
  const d = new Date();
  for (let i = 0; i < 6; i++) { out.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1); }
  return [...out].sort().reverse();
}

const chip = (on: boolean): React.CSSProperties => ({
  padding: '4px 10px', borderRadius: 999, fontSize: 12, minHeight: 28, cursor: 'pointer',
  border: `1px solid ${on ? BORDO : 'rgba(155,27,48,0.15)'}`, background: on ? BORDO : '#fff', color: on ? '#fff' : '#333',
});
const badge = (s: string): React.CSSProperties => {
  const col = s === 'de agreat' ? ['rgba(217,119,6,0.1)', '#b45309'] : s === 'alt sat' ? ['rgba(155,27,48,0.06)', '#9B1B30']
    : s === 'confirmată' ? ['#16a34a', '#fff'] : ['rgba(22,163,74,0.1)', '#15803d'];
  return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: col[0], color: col[1], whiteSpace: 'nowrap' };
};
const inputZi: React.CSSProperties = { width: 34, padding: '2px 3px', border: '1px solid rgba(155,27,48,0.15)', borderRadius: 6, textAlign: 'center', fontSize: 12, height: 24 };
const GRID = '70px 92px 1fr 1.5fr 120px';

type Stare = 'de agreat' | 'alt sat' | 'agreată' | 'confirmată';

function stareRand(r: RandAgreare, agreati: Agreat[], dirty: boolean): Stare {
  if (!agreati.length) return 'de agreat';
  if (r.confirmat_la && !dirty) return 'confirmată';
  const satele = agreati.flatMap((a) => normLoc(a.sat));
  const strain = r.nopti.some((n) => n.zile.length >= 3 && !suprapus(normLoc(n.loc), satele));
  return strain ? 'alt sat' : 'agreată';
}

function Rand({ r, luna, zileInLuna, soferi, onStare }: { r: RandAgreare; luna: string; zileInLuna: number; soferi: SoferOpt[]; onStare: (m: string, s: Stare) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [agreati, setAgreati] = useState<Agreat[]>(r.agreati);
  const [dirty, setDirty] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);
  const stare = stareRand(r, agreati, dirty);
  // părintele numără stările pentru filtre; se anunță la fiecare schimbare
  useMemo(() => onStare(r.m, stare), [r.m, stare, onStare]);

  const zileInSat = (sat: string | null) => {
    const chei = normLoc(sat); const out = new Set<number>();
    for (const n of r.nopti) if (suprapus(chei, normLoc(n.loc))) n.zile.forEach((z) => out.add(z));
    return [...out].sort((a, b) => a - b);
  };
  const adauga = (s: { id: string; nume: string; sat: string | null }, zile: number[], sursa: Agreat['sursa']) => {
    if (agreati.some((a) => a.driver_id === s.id)) return;
    setAgreati([...agreati, { driver_id: s.id, nume: s.nume, sat: s.sat, de: zile[0] ?? 1, pana: zile[zile.length - 1] ?? zileInLuna, sursa, zile }]);
    setDirty(true);
  };
  const dinNoapte = (n: RandAgreare['nopti'][number]) => {
    for (const s of n.soferi) {
      const opt = soferi.find((x) => x.id === s.id);
      adauga({ id: s.id, nume: s.nume, sat: opt?.sat ?? null }, zileInSat(opt?.sat ?? null), 'noapte');
    }
  };
  const dinLista = (id: string) => {
    const s = soferi.find((x) => x.id === id); if (!s) return;
    const zile = zileInSat(s.sat);
    adauga(s, zile, zile.length ? 'noapte' : 'manual');
  };
  const setZi = (id: string, k: 'de' | 'pana', v: string) => {
    const z = Math.max(1, Math.min(zileInLuna, Number(v) || 1));
    setAgreati(agreati.map((a) => (a.driver_id === id ? { ...a, [k]: z } : a))); setDirty(true);
  };
  const scoate = (id: string) => { setAgreati(agreati.filter((a) => a.driver_id !== id)); setDirty(true); };
  const salveaza = (confirma: boolean) => {
    setEroare(null);
    startTransition(async () => {
      try {
        await salveazaAgreare(luna, r.vehicle_id, agreati.map((a) => ({ driver_id: a.driver_id, de: a.de, pana: a.pana, sursa: a.sursa })), confirma);
        setDirty(false);
        router.refresh();
      } catch (e) { setEroare(e instanceof Error ? e.message : String(e)); }
    });
  };
  const listaUzina = soferi.filter((s) => !agreati.some((a) => a.driver_id === s.id) && (s.uzina === r.uzina || !s.uzina));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '7px 12px', borderBottom: '1px solid rgba(155,27,48,0.04)', alignItems: 'center', background: stare === 'de agreat' ? 'rgba(217,119,6,0.04)' : 'transparent' }}>
      <div style={{ fontWeight: 600 }}>{r.m}</div>
      <div style={{ color: '#666' }}>{r.uzina}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {r.nopti.length === 0 && <span style={{ color: '#d97706', fontSize: 12 }}>fără urmă GPS</span>}
        {r.nopti.map((n) => (
          <button key={n.loc} type="button" onClick={() => dinNoapte(n)}
            title={(n.soferi.length ? 'Locuiesc aici: ' + n.soferi.map((s) => s.nume).join(', ') : 'Niciun șofer din bază nu locuiește aici') + ' · nopți: ' + n.zile.join(', ')}
            style={{ padding: '2px 8px', borderRadius: 999, fontSize: 12, minHeight: 24, cursor: 'pointer', background: '#fff', color: n.zile.length >= 3 ? '#333' : '#666', border: `1px solid ${n.zile.length >= 3 ? 'rgba(155,27,48,0.35)' : 'rgba(0,0,0,0.12)'}` }}>
            {n.loc} {n.zile.length}{n.soferi.length ? '' : ' ?'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {agreati.map((a) => {
          const celule = Array.from({ length: zileInLuna }, (_, i) => i + 1).map((z) => {
            const inSat = a.zile.includes(z), inPer = z >= a.de && z <= a.pana;
            return <span key={z} style={{ display: 'inline-block', width: 6, height: 12, borderRadius: 1, background: inSat ? BORDO : inPer ? 'rgba(155,27,48,0.18)' : 'rgba(0,0,0,0.06)' }} />;
          });
          const inPerioada = a.zile.filter((z) => z >= a.de && z <= a.pana).length;
          return (
            <div key={a.driver_id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 2px 1px 8px', borderRadius: 999, background: 'rgba(155,27,48,0.06)', color: BORDO, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {a.nume}
                <button type="button" onClick={() => scoate(a.driver_id)} aria-label="Scoate șoferul" style={{ border: 0, background: 'transparent', color: BORDO, width: 20, height: 20, borderRadius: 999, padding: 0, lineHeight: 1, fontSize: 14, cursor: 'pointer' }}>×</button>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>
                <input type="number" min={1} max={zileInLuna} value={a.de} onChange={(e) => setZi(a.driver_id, 'de', e.target.value)} aria-label="De la ziua" style={inputZi} />
                –
                <input type="number" min={1} max={zileInLuna} value={a.pana} onChange={(e) => setZi(a.driver_id, 'pana', e.target.value)} aria-label="Până la ziua" style={inputZi} />
                .{luna.slice(5)}
              </span>
              <span title={a.zile.length ? 'Nopți în satul lui: ' + a.zile.join(', ') : 'Nicio noapte în satul lui' + (a.sat ? ` (${a.sat})` : ' — satul lipsește din bază')} style={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>{celule}</span>
              <span style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>{a.zile.length ? `${inPerioada} nopți acasă` : a.sat ? 'nicio noapte acasă' : 'fără sat în bază'} · {a.pana - a.de + 1} zile</span>
            </div>
          );
        })}
        <div>
          <select value="" onChange={(e) => dinLista(e.target.value)} aria-label="Adaugă șofer"
            style={{ padding: '2px 6px', border: '1px dashed rgba(155,27,48,0.3)', borderRadius: 999, background: '#fff', fontSize: 12, color: BORDO, height: 24, maxWidth: 220 }}>
            <option value="">+ șofer</option>
            {listaUzina.map((s) => <option key={s.id} value={s.id}>{s.nume}{s.sat ? ` · ${s.sat}` : ''}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={badge(stare)}>{stare}</span>
        {dirty && <button type="button" disabled={isPending} onClick={() => salveaza(false)} style={{ padding: 0, border: 0, background: 'transparent', color: BORDO, fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>salvează</button>}
        {agreati.length > 0 && stare !== 'confirmată' && <button type="button" disabled={isPending} onClick={() => salveaza(true)} style={{ padding: 0, border: 0, background: 'transparent', color: BORDO, fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>confirmă</button>}
        {eroare && <span style={{ color: '#b91c1c', fontSize: 11 }}>{eroare}</span>}
      </div>
    </div>
  );
}

export default function AgreareClient({ data }: { data: AgreareData }) {
  const router = useRouter();
  const [uz, setUz] = useState('Toate');
  const [filtru, setFiltru] = useState('toate');
  const [stari, setStari] = useState<Record<string, Stare>>({});
  const onStare = useMemo(() => (m: string, s: Stare) => setStari((p) => (p[m] === s ? p : { ...p, [m]: s })), []);

  const n = { total: data.randuri.length, deAgreat: 0, altSat: 0, agreate: 0 };
  for (const r of data.randuri) { const s = stari[r.m] ?? stareRand(r, r.agreati, false); if (s === 'de agreat') n.deAgreat++; else if (s === 'alt sat') n.altSat++; else n.agreate++; }
  const etichete: Record<string, string> = { toate: `Toate ${n.total}`, 'de agreat': `Fără șofer ${n.deAgreat}`, 'alt sat': `Doarme în alt sat ${n.altSat}`, 'agreată': `Agreate ${n.agreate}` };
  const vizibile = data.randuri.filter((r) => {
    const s = stari[r.m] ?? stareRand(r, r.agreati, false);
    return (uz === 'Toate' || r.uzina === uz) && (filtru === 'toate' || s === filtru || (filtru === 'agreată' && s === 'confirmată'));
  });

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 400, color: BORDO }}>Agreare șoferi pe mașini</h1>
        <select value={data.luna} onChange={(e) => router.push(`/lde/agreare?luna=${e.target.value}`)} aria-label="Luna"
          style={{ padding: '6px 10px', border: '1px solid rgba(155,27,48,0.15)', borderRadius: 8, background: '#fff', fontSize: 13, minHeight: 34 }}>
          {luniDisponibile(data.luna).map((l) => <option key={l} value={l}>{etichetaLuna(l)}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {UZINE.map((u) => <button key={u} type="button" onClick={() => setUz(u)} style={chip(uz === u)}>{u}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {STARI.map(([k]) => <button key={k} type="button" onClick={() => setFiltru(k)} style={chip(filtru === k)}>{etichete[k]}</button>)}
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 'var(--radius, 24px)', padding: '8px 12px', boxShadow: '0 8px 40px rgba(155,27,48,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '9px 12px', borderBottom: '1px solid rgba(155,27,48,0.08)', fontSize: 10, fontWeight: 600, color: 'rgba(155,27,48,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <div>Mașina</div><div>Uzina</div><div>Doarme la (GPS) · nopți</div><div>Agreați pe lună · perioada și zilele exacte</div><div>Stare</div>
        </div>
        {vizibile.map((r) => <Rand key={r.m + data.luna} r={r} luna={data.luna} zileInLuna={data.zileInLuna} soferi={data.soferi} onStare={onStare} />)}
        {!vizibile.length && <p style={{ padding: 12, color: '#666' }}>Nicio mașină pe filtrul ales.</p>}
      </div>
      <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{etichetaLuna(data.luna)}: {n.total} mașini de uzină, {n.agreate} agreate, {n.altSat} dorm în alt sat decât al șoferului, {n.deAgreat} fără șofer.</span>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><span style={{ display: 'inline-block', width: 10, height: 12, background: BORDO, borderRadius: 2 }} /> noapte în satul șoferului</span>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><span style={{ display: 'inline-block', width: 10, height: 12, background: 'rgba(155,27,48,0.18)', borderRadius: 2 }} /> în perioada agreată</span>
        <span>Click pe o localitate adaugă șoferii care locuiesc acolo, cu nopțile lor; «?» = niciun șofer din bază nu locuiește acolo. Interurbanul și suburbanul nu intră.</span>
      </div>
    </div>
  );
}
