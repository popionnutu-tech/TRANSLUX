'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Punct, UrmaRuta } from '@/components/ScheletMap';

const ScheletMap = dynamic(() => import('@/components/ScheletMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Se încarcă harta…</div>,
});

// Scheletul rutelor interurbane nord ↔ Chișinău (ION-55). Ion, 25.09.2026: «tur trebuie să fie egal cu
// retur în schelet întotdeauna, dacă lăsăm la o parte drumurile șoferului» — deci UN drum pe rută, cu
// km-ul fiecărei opriri de la capătul de nord; turul îl citește crescător, returul descrescător.
// Alături, realul șoferului pe fiecare sens: de unde pornește și unde ajunge mașina de fapt.
type Oprire = {
  o: number; n: string; alias?: string[]; gara: string | null; tarif: boolean; c: Punct; km: number;
  hN: string | null; hC: string | null;
  oraTur: number | null; abTur: number | null; atinsTur: number | null; langaTur: number | null;
  oraRetur: number | null; abRetur: number | null; atinsRetur: number | null; langaRetur: number | null;
};
type Real = { capA: string; capB: string; km: number; zile: number; cuUrma: number; zi: string; masina: string; masini: string[]; durata: number } | null;
type Ruta = {
  id: number; nume: string; timeNord: string; timeChisinau: string;
  capNord: string; capSud: string; km: number; ajuns: boolean; tronsoane: number; kmTur: number; kmRetur: number;
  stops: Oprire[]; shape: Punct[]; real: { tur: Real; retur: Real }; neatinse: string[]; sarite: string[];
  // Optimizări simple (Ion, 25.09): unde doarme mașina, de unde pornește turul, km goi dimineața, bucata de rută
  // nelivrată dimineața și seara; câștigul = goii de dimineață, dacă mașina ar pleca de la capătul rutei.
  optim: { casa: string; casaKm: number; start: string; startKm: number; goiDim: number; nelivratDim: number; nelivratSeara: number; castig: number; kmAzi: number | null; kmLaCapat: number } | null;
  site: { tarif: string | null; ramura: string | null; kmTarif: number | null; opririPeste2: number | null; lipsa: string[] } | null;
};
export type ScheletMejgorod = {
  fixat: string; perioada: { de: string; pana: string; zile: number }; curse: number; intregi: number;
  gari: Record<string, Punct>; rute: Ruta[];
};

const GARI: Record<string, string> = { chisinau: 'Chișinău', balti: 'Bălți', edinet: 'Edineț', briceni: 'Briceni', lipcani: 'Lipcani', ocnita: 'Ocnița', riscani: 'Rîșcani' };
const culoarea = (i: number) => `hsl(${Math.round((i * 137.508 + 200) % 360)} 62% 40%)`;
const nr1 = (x: number | null | undefined) => x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const zz = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const hh = (m: number | null) => m == null ? '—' : `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const ab = (a: number | null) => a == null ? '' : a > 0 ? `+${a}` : String(a);
const numeCap = (s: Oprire) => s.alias?.length ? `${s.n} / ${s.alias.join(' / ')}` : s.n;

const MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const ETICHETA: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};

export default function ScheletMejgorodClient({ schelet }: { schelet: ScheletMejgorod }) {
  const [ales, setAles] = useState<string | null>(null);

  useEffect(() => {
    const cere = (strange: boolean) => {
      window.dispatchEvent(new CustomEvent('tlx:bara', { detail: { strange } }));
    };
    cere(true);
    return () => cere(false);
  }, []);

  const indice = useMemo(() => new Map(schelet.rute.map((r, i) => [String(r.id), i])), [schelet.rute]);
  const cul = (r: Ruta) => culoarea(indice.get(String(r.id)) ?? 0);
  const kmZi = schelet.rute.reduce((s, r) => s + 2 * r.km, 0);
  const kmReal = schelet.rute.reduce((s, r) => s + (r.real.tur?.km ?? 0) + (r.real.retur?.km ?? 0), 0);
  const goiZi = schelet.rute.reduce((s, r) => s + (r.optim?.goiDim ?? 0), 0);

  // Pe hartă: linia rutei (o singură linie, tur = retur); ca puncte, capătul de nord și gările.
  const urme: UrmaRuta[] = useMemo(() => schelet.rute.map((r) => ({
    id: String(r.id), culoare: culoarea(indice.get(String(r.id)) ?? 0), capat: r.capNord, plin: [r.shape],
    sate: r.stops.filter((s, i) => i === 0 || s.gara).map((s) => ({ n: s.gara ? GARI[s.gara] ?? s.n : s.n, c: s.c })),
  })), [schelet.rute, indice]);
  const porti = [{ c: schelet.gari.chisinau, n: 'Chișinău' }];
  const ruta = ales ? schelet.rute.find((r) => String(r.id) === ales) ?? null : null;

  const insigna = (r: Ruta, mare = false) => (
    <span style={{
      fontFamily: MONO, fontSize: mare ? 11 : 10, fontWeight: 700, color: '#fff', background: cul(r),
      borderRadius: 4, padding: mare ? '3px 6px' : '2px 4px', minWidth: mare ? 30 : 27, textAlign: 'center', flexShrink: 0,
    }}>{r.id}</span>
  );

  const altfel = (r: Ruta, sens: 'tur' | 'retur') => {
    const x = r.real[sens]; if (!x) return false;
    const A = r.stops[0], B = r.stops[r.stops.length - 1];
    const e = (nume: string, s: Oprire) => nume === s.n || (s.alias || []).includes(nume);
    return sens === 'tur' ? !(e(x.capA, A) && e(x.capB, B)) : !(e(x.capA, B) && e(x.capB, A));
  };

  const rand = (r: Ruta) => {
    const activ = String(r.id) === ales;
    const dif = [altfel(r, 'tur'), altfel(r, 'retur')].filter(Boolean).length;
    return (
      <button
        key={r.id}
        onClick={() => setAles(activ ? null : String(r.id))}
        aria-current={activ}
        style={{
          display: 'block', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit',
          background: activ ? 'var(--primary-dim)' : 'transparent',
          border: 0, borderBottom: '1px solid var(--border-accent)',
          borderLeft: `3px solid ${activ ? 'var(--primary)' : 'transparent'}`,
          padding: '6px 11px', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {insigna(r)}
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.capNord} ↔ {r.capSud}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{nr1(r.km)}</span>
          <span style={{ fontSize: 9.5, color: 'var(--text-muted)', width: 13 }}>km</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1, paddingLeft: 34 }}>
          nord {r.timeNord} · Chișinău {r.timeChisinau} · {r.stops.length} opriri
          {dif > 0 && <b style={{ color: '#B06A1F', fontWeight: 600 }}> · realul e altfel pe {dif === 2 ? 'ambele sensuri' : altfel(r, 'tur') ? 'tur' : 'retur'}</b>}
          {!r.ajuns && <b style={{ color: 'var(--danger)', fontWeight: 600 }}> · nu ajunge la capăt</b>}
        </div>
      </button>
    );
  };

  const realRand = (r: Ruta, sens: 'tur' | 'retur') => {
    const x = r.real[sens];
    const n = { fontFamily: MONO, textAlign: 'right' as const, padding: '3px 0 3px 6px', fontVariantNumeric: 'tabular-nums' as const };
    if (!x) return (
      <tr key={sens} style={{ borderTop: '1px solid var(--border-accent)' }}>
        <td style={{ padding: '3px 0', color: 'var(--text-secondary)' }}>{sens}</td>
        <td colSpan={3} style={{ padding: '3px 0 3px 6px', color: 'var(--danger)' }}>nicio zi întreagă în GPS</td>
      </tr>
    );
    const oraA = r.stops.find((s) => s.n === x.capA || (s.alias || []).includes(x.capA)), oraB = r.stops.find((s) => s.n === x.capB || (s.alias || []).includes(x.capB));
    const ora = (s: Oprire | undefined) => s ? (sens === 'tur' ? s.oraTur : s.oraRetur) : null;
    return (
      <tr key={sens} style={{ borderTop: '1px solid var(--border-accent)' }} title={`ziua desenată ${zz(x.zi)} ${x.masina} · ${x.zile} zile întregi din ${x.cuUrma} cu urmă · ${x.durata} min · mașini ${x.masini.join(', ')}`}>
        <td style={{ padding: '3px 0', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{sens}</td>
        <td style={{ padding: '3px 0 3px 6px', whiteSpace: 'nowrap' }}>
          {x.capA} → {x.capB}
          {altfel(r, sens) && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#B06A1F', marginLeft: 4 }}>ALTFEL</span>}
        </td>
        <td style={n}>{nr1(x.km)}</td>
        <td style={{ ...n, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{hh(ora(oraA))}→{hh(ora(oraB))} · {x.zile} z</td>
      </tr>
    );
  };

  const clasa = (at: number | null, lg: number | null) => lg == null || lg < 0.5 ? 'var(--danger)' : at != null && at < 0.5 ? 'var(--text-secondary)' : 'var(--text)';

  return (
    <div style={{ padding: '12px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>Scheletul rutelor — interurbane nord ↔ Chișinău</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11.5, margin: '3px 0 0', maxWidth: '96ch', lineHeight: 1.45 }}>
            Un drum pe rută: turul îl parcurge spre Chișinău, returul înapoi, cu aceiași km. Construit tronson cu tronson din urma GPS a
            ambelor sensuri, {zz(schelet.perioada.de)}–{zz(schelet.perioada.pana)} ({schelet.perioada.zile} zile). Drumurile șoferului (acasă, la garaj) nu intră: stau la «real».
          </p>
        </div>
        <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
          {[
            ['rute', String(schelet.rute.length)],
            ['km schelet', `${Math.round(kmZi).toLocaleString('ro-RO')}/zi`],
            ['km real', `${Math.round(kmReal).toLocaleString('ro-RO')}/zi`],
            ['goi dimineața', `${Math.round(goiZi)}/zi`],
            ['curse cu urmă', `${schelet.curse.toLocaleString('ro-RO')}`],
            ['fixat', schelet.fixat],
          ].map(([e, v]) => (
            <div key={e}>
              <div style={ETICHETA}>{e}</div>
              <div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 500, color: 'var(--primary)', marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: ruta ? 'minmax(300px, 340px) 1fr minmax(380px, 460px)' : 'minmax(300px, 340px) 1fr',
        transition: 'grid-template-columns 0.18s ease',
        border: '1px solid var(--border-accent)', borderRadius: 12, overflow: 'hidden',
        background: '#fff', height: 'calc(100vh - 160px)', minHeight: 440,
      }}>
        <div style={{ borderRight: '1px solid var(--border-accent)', overflowY: 'auto' }}>
          <div style={{ ...ETICHETA, padding: '6px 11px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-accent)', position: 'sticky', top: 0, zIndex: 1 }}>
            {schelet.rute.length} rute · km pe un sens
          </div>
          {schelet.rute.map(rand)}
        </div>

        <div style={{ position: 'relative' }}>
          <ScheletMap urme={urme} ales={ales} porti={porti} />
          <div style={{
            position: 'absolute', left: 10, bottom: 22, zIndex: 500, background: '#fff',
            border: '1px solid var(--border-accent)', borderRadius: 6, padding: '6px 9px',
            fontSize: 10.5, color: 'var(--text-secondary)',
          }}>
            Culoarea = ruta · o linie = tur și retur
          </div>
        </div>

        {ruta && (
          <div style={{ borderLeft: '1px solid var(--border-accent)', overflowY: 'auto', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              {insigna(ruta, true)}
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ruta.nume}</span>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.45 }}>
              Schelet <b style={{ color: 'var(--text)' }}>{ruta.capNord} ↔ {ruta.capSud}, {nr1(ruta.km)} km</b> pe un sens, {ruta.stops.length} opriri, {ruta.tronsoane} tronsoane
              (pe urmă: tur {nr1(ruta.kmTur)}, retur {nr1(ruta.kmRetur)}).
              {ruta.site?.kmTarif != null && <> Tariful de pe site «{ruta.site.tarif}»: {nr1(ruta.site.kmTarif)} km.</>}
              {ruta.neatinse.length > 0 && <> Nimeni nu trece pe la: <b style={{ color: 'var(--danger)' }}>{ruta.neatinse.join(', ')}</b>.</>}
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
              <thead>
                <tr>
                  {['real', 'capete', 'km', 'ore · zile'].map((h, i) => (
                    <th key={h} style={{ ...ETICHETA, textAlign: i < 2 ? 'left' : 'right', padding: '0 0 4px 6px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>{realRand(ruta, 'tur')}{realRand(ruta, 'retur')}</tbody>
            </table>

            {ruta.optim && (
              <div style={{ border: '1px solid var(--border-accent)', borderRadius: 8, padding: '8px 10px', marginBottom: 12, background: 'var(--bg-elevated)' }}>
                <div style={{ ...ETICHETA, marginBottom: 4 }}>optimizări simple</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                  Doarme la <b>{ruta.optim.casa}</b> (km {nr1(ruta.optim.casaKm)} de la nord), turul pornește din <b>{ruta.optim.start}</b> (km {nr1(ruta.optim.startKm)}).
                  {ruta.optim.goiDim > 0
                    ? <> Dimineața merge gol <b style={{ color: '#B06A1F' }}>{nr1(ruta.optim.goiDim)} km</b> de acasă la start.</>
                    : <> Dimineața nu merge gol.</>}
                  {ruta.optim.nelivratDim > 0 && <> Bucata {ruta.capNord} → {ruta.optim.start} ({nr1(ruta.optim.nelivratDim)} km) nu se face dimineața cu oameni.</>}
                  {ruta.optim.nelivratSeara > 0 && <> Seara returul se oprește la {ruta.optim.casa}: {nr1(ruta.optim.nelivratSeara)} km până la {ruta.capNord} rămân nefăcuți.</>}
                </div>
                <div style={{ fontSize: 11.5, marginTop: 5, lineHeight: 1.5 }}>
                  Dacă ar pleca de la capătul rutei ({ruta.capNord}): <b style={{ color: ruta.optim.castig > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>−{nr1(ruta.optim.castig)} km goi pe zi</b>
                  {ruta.optim.kmAzi != null && <span style={{ color: 'var(--text-secondary)' }}> · km pe zi {nr1(ruta.optim.kmAzi)} azi → {nr1(ruta.optim.kmLaCapat)} cu tot drumul cu oameni</span>}.
                  <span style={{ color: 'var(--text-secondary)' }}> Livrarea de dimineață nu intră în câștig.</span>
                </div>
              </div>
            )}

            <div style={{ ...ETICHETA, marginBottom: 4 }}>opririle · km de la nord · tur și retur: grafic, real, abatere, atinsă</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr>
                  {['oprire', 'km', 'tur', 'real', '±', '%', 'retur', 'real', '±', '%'].map((h, i) => (
                    <th key={i} style={{ ...ETICHETA, textAlign: i === 0 ? 'left' : 'right', padding: '0 0 3px 5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ruta.stops.map((s) => {
                  const n = { fontFamily: MONO, textAlign: 'right' as const, padding: '2px 0 2px 5px', fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const };
                  const proc = (a: number | null, l: number | null) => a == null ? '—' : `${Math.round(a * 100)}/${Math.round((l ?? 0) * 100)}`;
                  return (
                    <tr key={s.o} style={{ borderTop: '1px solid var(--border-accent)' }}
                      title={s.tarif ? 'fără coordonate în indexul de locuri: pusă pe linie la km-ul din tarif' : `atinsă = % din zile la ≤1 km / ≤3 km de oprire`}>
                      <td style={{ padding: '2px 0', whiteSpace: 'nowrap', color: clasa(s.atinsTur, s.langaTur), fontWeight: s.gara ? 600 : 400 }}>
                        {numeCap(s)}{s.gara ? ' ▣' : ''}{s.tarif ? <span style={{ fontSize: 8.5, color: 'var(--text-muted)', marginLeft: 3 }}>tarif</span> : null}
                      </td>
                      <td style={n}>{nr1(s.km)}</td>
                      <td style={{ ...n, color: 'var(--text-secondary)' }}>{s.hN ?? '—'}</td>
                      <td style={n}>{hh(s.oraTur)}</td>
                      <td style={{ ...n, color: s.abTur != null && Math.abs(s.abTur) >= 15 ? '#B06A1F' : 'var(--text-secondary)' }}>{ab(s.abTur)}</td>
                      <td style={{ ...n, color: 'var(--text-secondary)', fontSize: 10 }}>{proc(s.atinsTur, s.langaTur)}</td>
                      <td style={{ ...n, color: 'var(--text-secondary)' }}>{s.hC ?? '—'}</td>
                      <td style={n}>{hh(s.oraRetur)}</td>
                      <td style={{ ...n, color: s.abRetur != null && Math.abs(s.abRetur) >= 15 ? '#B06A1F' : 'var(--text-secondary)' }}>{ab(s.abRetur)}</td>
                      <td style={{ ...n, color: 'var(--text-secondary)', fontSize: 10 }}>{proc(s.atinsRetur, s.langaRetur)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 8, maxWidth: '150ch', lineHeight: 1.5 }}>
        Lanțul opririlor din grafic în ordinea reală de pe șosea; fiecare tronson oprire → oprire e luat din cursele oricărei rute care au trecut
        pe la ambele opriri, în ambele sensuri, km = mediana. Așa scheletul ajunge la Criva Vama și când mașina rutei se oprește la Briceni.
        «Real» = capetele unde mașina chiar pornește și ajunge în majoritatea zilelor, km-ul median al zilelor întregi; ALTFEL = alte capete decât scheletul.
        Ora reală și abaterea față de grafic vin din zilele întregi ale rutei; «%» = în câte zile trece la ≤1 km / ≤3 km de oprire; roșu = oprirea e dincolo de capătul real.
        ▣ = gară, peronul exact. Tariful de la bilete nu se schimbă (Ion, 25.09).
        Optimizări simple: casa mașinii e unde se termină returul; km goi dimineața = de acasă până unde pornește turul, pe schelet. Dacă mașina ar pleca de la
        capătul rutei, goii de dimineață dispar, iar returul merge până la capăt cu oameni, cu aproape aceiași km pe zi. Livrarea de dimineață (bucata de rută
        pe care turul n-o face) e arătată, dar nu intră în câștig.
      </p>
    </div>
  );
}
