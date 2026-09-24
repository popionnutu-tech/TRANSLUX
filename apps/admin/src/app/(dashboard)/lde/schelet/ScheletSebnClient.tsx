'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Punct, UrmaRuta } from '@/components/ScheletMap';

const ScheletMap = dynamic(() => import('@/components/ScheletMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Se încarcă harta…</div>,
});

// Scheletul SEBN (ION-38). Mai simplu decât la Ungheni: o rută = un sat, aceeași rută pe toate
// trei schimburile. Deci rândul e ruta, iar schimburile stau în panoul din dreapta.
type Bucata = { gol: Punct[]; plin: Punct[]; sate: { n: string; c: Punct }[] };
type Schimb = {
  schimb: 's1' | 's2' | 's3' | 'adm'; masina: string; de?: string; pana?: string;
  tur: number; retur: number; etalon: number; gol: number; zi: string; zile: number; asim?: boolean;
};
type RutaSebn = {
  id: string; uz: string; nume: string; sate: string[]; sch: number; adm?: boolean;
  capat: string; act?: number; nota?: string; schimburi: Schimb[]; c?: Punct;
  g?: { tur: Bucata; retur: Bucata };
};
export type ScheletSebn = {
  fixat: string; actLuna: string;
  uzine: { id: string; nume: string; poarta: Punct }[];
  rute: RutaSebn[];
};

// Ion, 24.09.2026: «fă fiecare cursă cu culoarea ei». Nuanțe despărțite de unghiul de aur,
// ca două rute vecine în listă să nu semene.
const culoarea = (i: number) => `hsl(${Math.round((i * 137.508 + 200) % 360)} 62% 40%)`;
const nr1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const zz = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const SCH: Record<Schimb['schimb'], string> = { s1: 'sch. 1', s2: 'sch. 2', s3: 'sch. 3', adm: 'ADM' };
const acum = (s: Schimb) => !s.pana;

const MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const ETICHETA: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};

// cât plătește actul SEBN față de km cu oameni din GPS (tur + retur, aceeași unitate ca actul)
const fataDeAct = (act: number, km: number) => {
  const p = Math.round((100 * (act - km)) / km);
  const culoare = Math.abs(p) <= 7 ? 'var(--success)' : p > 0 ? '#B06A1F' : 'var(--danger)';
  return { p, text: `${p > 0 ? '+' : ''}${p}%`, culoare };
};

export default function ScheletSebnClient({ schelet }: { schelet: ScheletSebn }) {
  const [ales, setAles] = useState<string | null>(null);

  useEffect(() => {
    const cere = (strange: boolean) => {
      window.dispatchEvent(new CustomEvent('tlx:bara', { detail: { strange } }));
    };
    cere(true);
    return () => cere(false);
  }, []);

  const indice = useMemo(() => new Map(schelet.rute.map((r, i) => [r.id, i])), [schelet.rute]);
  const cul = (r: RutaSebn) => culoarea(indice.get(r.id) ?? 0);

  // km pe zi: doar mașinile care fac ruta acum — cele «până la» ar număra ruta de două ori
  const actuale = schelet.rute.flatMap((r) => r.schimburi.filter(acum));
  const kmZi = actuale.reduce((s, x) => s + x.tur + x.retur, 0);
  const masurate = schelet.rute.filter((r) => r.schimburi.length);

  const urme: UrmaRuta[] = useMemo(() => schelet.rute.filter((r) => r.g).map((r) => {
    const plin = [r.g!.tur.plin, r.g!.retur.plin].filter((x) => x.length > 1);
    const vazut = new Set<string>();
    const sate = [...r.g!.tur.sate, ...r.g!.retur.sate].filter((x) => {
      if (vazut.has(x.n)) return false;
      vazut.add(x.n);
      return true;
    });
    if (r.c && !vazut.has(r.capat)) sate.push({ n: r.capat, c: r.c });
    return { id: r.id, culoare: culoarea(indice.get(r.id) ?? 0), capat: r.capat, plin, sate };
  }), [schelet.rute, indice]);

  const porti = schelet.uzine.map((u) => ({ c: u.poarta, n: u.nume }));
  const ruta = ales ? schelet.rute.find((r) => r.id === ales) ?? null : null;

  const insigna = (r: RutaSebn, mare = false) => (
    <span style={{
      fontFamily: MONO, fontSize: mare ? 11 : 10, fontWeight: 700, color: '#fff',
      background: r.schimburi.length ? cul(r) : '#c5b9bc',
      borderRadius: 4, padding: mare ? '3px 6px' : '2px 4px', minWidth: mare ? 30 : 27,
      textAlign: 'center', flexShrink: 0,
    }}>{r.id}</span>
  );

  const rand = (r: RutaSebn) => {
    const activ = r.id === ales;
    const et = r.schimburi.filter(acum).map((s) => s.etalon);
    const km = et.length ? et.reduce((a, b) => a + b, 0) / et.length : null;
    const fa = r.act && km ? fataDeAct(r.act, km * 2) : null;
    return (
      <button
        key={r.id}
        onClick={() => setAles(activ ? null : r.id)}
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
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 600,
            color: r.schimburi.length ? 'var(--text)' : 'var(--text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{r.nume}</span>
          <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {km != null ? nr1(km * 2) : '—'}
          </span>
          <span style={{ fontSize: 9.5, color: 'var(--text-muted)', width: 13 }}>{km != null ? 'km' : ''}</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1, paddingLeft: 34 }}>
          {r.adm ? 'ADM' : `${r.sch} ${r.sch === 1 ? 'schimb' : 'schimburi'}`}
          {' · '}{[...new Set(r.schimburi.filter(acum).map((s) => s.masina))].join(', ') || 'fără mașină în GPS'}
          {r.act != null && <> · act {nr1(r.act)}{fa && <b style={{ color: fa.culoare, fontWeight: 600 }}> {fa.text}</b>}</>}
        </div>
      </button>
    );
  };

  const grup = (u: ScheletSebn['uzine'][number]) => {
    const rute = schelet.rute.filter((r) => r.uz === u.id);
    return (
      <div key={u.id}>
        <div style={{
          ...ETICHETA, padding: '6px 11px', background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-accent)', position: 'sticky', top: 0, zIndex: 1,
        }}>
          {u.nume} · {rute.length} {rute.length === 1 ? 'rută' : 'rute'}
        </div>
        {rute.map(rand)}
      </div>
    );
  };

  return (
    <div style={{ padding: '12px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>Scheletul rutelor — SEBN Orhei și Strășeni</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11.5, margin: '3px 0 0', maxWidth: '92ch', lineHeight: 1.45 }}>
            Traseul fix al fiecărei rute, pe fiecare schimb, tur și retur. Km sunt mediana urmei GPS pe trei luni;
            lângă ei, km tur-retur din actul SEBN pe {schelet.actLuna}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
          {[
            ['rute măsurate', `${masurate.length}/${schelet.rute.length}`],
            ['schimburi', String(actuale.length)],
            ['km cu oameni', `${Math.round(kmZi).toLocaleString('ro-RO')}/zi`],
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
        gridTemplateColumns: ruta ? 'minmax(300px, 340px) 1fr minmax(320px, 380px)' : 'minmax(300px, 340px) 1fr',
        transition: 'grid-template-columns 0.18s ease',
        border: '1px solid var(--border-accent)', borderRadius: 12, overflow: 'hidden',
        background: '#fff', height: 'calc(100vh - 160px)', minHeight: 440,
      }}>
        <div style={{ borderRight: '1px solid var(--border-accent)', overflowY: 'auto' }}>
          {schelet.uzine.map(grup)}
        </div>

        <div style={{ position: 'relative' }}>
          <ScheletMap urme={urme} ales={ales} porti={porti} />
          <div style={{
            position: 'absolute', left: 10, bottom: 22, zIndex: 500, background: '#fff',
            border: '1px solid var(--border-accent)', borderRadius: 6, padding: '6px 9px',
            fontSize: 10.5, color: 'var(--text-secondary)',
          }}>
            Culoarea = ruta · drumul cu oameni
          </div>
        </div>

        {ruta && (
          <div style={{ borderLeft: '1px solid var(--border-accent)', overflowY: 'auto', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              {insigna(ruta, true)}
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ruta.nume}</span>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
              Capătul: <b style={{ color: 'var(--text)' }}>{ruta.capat}</b> — de acolo începe strânsul, acolo se termină lăsatul.
              {ruta.act != null && <> Actul SEBN: <b style={{ color: 'var(--text)' }}>{nr1(ruta.act)} km</b> tur-retur.</>}
            </p>

            {ruta.schimburi.length === 0 ? (
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Nicio cursă găsită în GPS pentru ruta asta.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['', '', 'tur', 'retur', 'gol', 'act'].map((h, i) => (
                      <th key={i} style={{ ...ETICHETA, textAlign: i < 2 ? 'left' : 'right', padding: '0 0 4px 6px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ruta.schimburi.map((s) => {
                    const fa = ruta.act != null ? fataDeAct(ruta.act, s.tur + s.retur) : null;
                    const n = { fontFamily: MONO, textAlign: 'right' as const, padding: '3px 0 3px 6px', fontVariantNumeric: 'tabular-nums' as const };
                    return (
                      <tr key={s.schimb + s.masina} style={{ borderTop: '1px solid var(--border-accent)', opacity: acum(s) ? 1 : 0.6 }}
                        title={`ziua desenată ${zz(s.zi)} · ${s.zile} zile măsurate${s.asim ? ' · buclă: turul și returul merg pe drumuri diferite' : ''}`}>
                        <td style={{ padding: '3px 0', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{SCH[s.schimb]}{s.asim ? ' ↺' : ''}</td>
                        <td style={{ padding: '3px 0 3px 6px', whiteSpace: 'nowrap' }}>
                          {s.masina}
                          {s.pana && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}> până {zz(s.pana)}</span>}
                          {s.de && !s.pana && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}> din {zz(s.de)}</span>}
                        </td>
                        <td style={n}>{nr1(s.tur)}</td>
                        <td style={n}>{nr1(s.retur)}</td>
                        <td style={{ ...n, color: 'var(--text-secondary)' }}>{nr1(s.gol)}</td>
                        <td style={{ ...n, color: fa?.culoare, fontWeight: 600 }}>{fa?.text ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {ruta.nota && (
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.45 }}>{ruta.nota}</p>
            )}
          </div>
        )}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 8, maxWidth: '150ch', lineHeight: 1.5 }}>
        Capătul rutei e primul sat din nomenclator; tăietura dintre gol și plin se face pe urmă, în punctul cel mai apropiat
        de el. O zi intră în etalon doar cu tur și retur până la capăt; etalonul e mediana, nu media. Coloana «act»: verde la ±7%,
        portocaliu când actul plătește mai mult decât drumul cu oameni (de obicei include și drumul gol de acasă), roșu când plătește mai puțin.
        Mașinile marcate «până la» au lucrat pe rută doar o perioadă și nu intră în km pe zi.
      </p>
    </div>
  );
}
