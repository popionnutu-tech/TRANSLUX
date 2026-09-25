'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Poarta, Punct, UrmaRuta } from '@/components/ScheletMap';

const ScheletMap = dynamic(() => import('@/components/ScheletMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Se încarcă harta…</div>,
});

// Scheletul LEAR Florești (ION-58). Ca la Ungheni, dar cu ce a cerut Ion pe 24–25.09.2026:
// denumirea rutei e cea din actul de recepție nr. 36.1 (nu după mașină), sub rută stau satele din
// act cu procentul de curse în care mașina chiar oprește acolo, plus opririle regulate din afara
// actului — iar drumul gol nu apare nicăieri («în schelet gol nu trebuie»).
export type Bucata = { gol: Punct[]; plin: Punct[]; sate: { n: string; c: Punct }[] };
export type StareSat = 'opreste' | 'trece' | 'lipseste';
export type RutaFloresti = {
  id: string; tura: 'A' | 'B'; nr: number; loc: number; denumire: string; sate: string[]; masina: string;
  capat?: string; tur?: number; retur?: number; etalon?: number; dif?: number; zi?: string; zile?: number;
  g?: { tur?: Bucata; retur?: Bucata };
  opriri?: { n: string; p: number }[];
  inPlus?: { n: string; p: number }[];
  zilePeSat?: { tur?: { sate: { n: string; st: StareSat }[] }; retur?: { sate: { n: string; st: StareSat }[] } };
};
export type ScheletFloresti = { fixat: string; uzina: string; poarta: Punct; orbe: string[]; rute: RutaFloresti[] };

const CULOARE: Record<'A' | 'B', string> = { A: '#2F6F68', B: '#B06A1F' };
const nr1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const zz = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

const MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const ETICHETA: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};

// culoarea procentului: de la 50% în sus satul e al rutei, 20–49 e ocazional, sub 20 e pe hârtie
const culoareProcent = (p: number) => (p >= 50 ? 'var(--success)' : p >= 20 ? '#B06A1F' : 'var(--danger)');

export default function ScheletFlorestiClient({ schelet }: { schelet: ScheletFloresti }) {
  const [ales, setAles] = useState<string | null>(null);

  useEffect(() => {
    const cere = (strange: boolean) => {
      window.dispatchEvent(new CustomEvent('tlx:bara', { detail: { strange } }));
    };
    cere(true);
    return () => cere(false);
  }, []);

  const masurate = schelet.rute.filter((r) => r.etalon != null);
  const kmZi = masurate.reduce((s, r) => s + (r.tur ?? 0) + (r.retur ?? 0), 0);
  const masini = new Set(schelet.rute.map((r) => r.masina)).size;

  // Pe hartă: doar drumul cu oameni și satele care cad pe el (Ion, 25.09: golul nu intră în schelet).
  const urme: UrmaRuta[] = useMemo(() => {
    const aproape = (c: Punct, linii: Punct[][], prag = 0.8) => {
      for (const l of linii) for (const p of l) {
        const dla = (p[0] - c[0]) * 111.32;
        const dlo = (p[1] - c[1]) * 111.32 * Math.cos(((p[0] + c[0]) / 2) * Math.PI / 180);
        if (dla * dla + dlo * dlo <= prag * prag) return true;
      }
      return false;
    };
    return schelet.rute.filter((r) => r.g).map((r) => {
      const plin = [r.g?.tur?.plin, r.g?.retur?.plin].filter((x): x is Punct[] => !!x && x.length > 1);
      const toate = [...(r.g?.tur?.sate ?? []), ...(r.g?.retur?.sate ?? [])];
      const vazut = new Set<string>();
      const sate = toate.filter((x) => {
        if (vazut.has(x.n)) return false;
        vazut.add(x.n);
        return x.n === r.capat || aproape(x.c, plin);
      });
      return { id: r.id, culoare: CULOARE[r.tura], capat: r.capat, plin, sate };
    });
  }, [schelet.rute]);

  const porti: Poarta[] = useMemo(() => [{ c: schelet.poarta, n: 'LEAR' }], [schelet.poarta]);
  const ruta = ales ? schelet.rute.find((r) => r.id === ales) ?? null : null;

  const insigna = (r: RutaFloresti, mare = false) => (
    <span style={{
      fontFamily: MONO, fontSize: mare ? 11 : 10, fontWeight: 700, color: '#fff',
      background: r.etalon == null ? '#c5b9bc' : CULOARE[r.tura],
      borderRadius: 4, padding: mare ? '3px 6px' : '2px 4px', minWidth: mare ? 27 : 23,
      textAlign: 'center', flexShrink: 0,
    }}>{r.id}</span>
  );

  // starea satului în ziua desenată: oprește / doar trece / lipsește, pe oricare din sensuri
  const stare = (r: RutaFloresti, sat: string): StareSat => {
    const st = [r.zilePeSat?.tur, r.zilePeSat?.retur].map((z) => z?.sate.find((x) => x.n === sat)?.st);
    return st.includes('opreste') ? 'opreste' : st.includes('trece') ? 'trece' : 'lipseste';
  };

  const rand = (r: RutaFloresti) => {
    const activ = r.id === ales;
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
            flex: 1, fontSize: 12.5, fontWeight: 600, lineHeight: 1.3,
            color: r.etalon == null ? 'var(--text-secondary)' : 'var(--text)',
          }}>{r.denumire}</span>
          <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {r.etalon != null ? nr1(r.etalon * 2) : '—'}
          </span>
          <span style={{ fontSize: 9.5, color: 'var(--text-muted)', width: 13 }}>{r.etalon != null ? 'km' : ''}</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1, paddingLeft: 30 }}>
          {r.masina} · {r.loc} locuri · {r.sate.length} sate
          {r.etalon != null ? ` · abatere ${r.dif}%` : ' · fără măsurare'}
        </div>
      </button>
    );
  };

  const grup = (t: 'A' | 'B') => {
    const rute = schelet.rute.filter((r) => r.tura === t);
    return (
      <div key={t}>
        <div style={{
          ...ETICHETA, padding: '6px 11px', background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-accent)', position: 'sticky', top: 0, zIndex: 1,
        }}>
          Tura {t} · {rute.length} rute · {rute.reduce((s, r) => s + r.loc, 0)} locuri
        </div>
        {rute.map(rand)}
      </div>
    );
  };

  const cifra = (et: string, val: string, sub: string, culoare?: string) => (
    <div key={et} style={{
      display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0',
      borderBottom: '1px solid var(--border-accent)',
    }}>
      <span style={{ ...ETICHETA, width: 66, lineHeight: 1.3 }}>{et}</span>
      <span style={{
        fontFamily: MONO, fontSize: 16, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
        color: culoare ?? 'var(--text)',
      }}>{val}</span>
      <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{sub}</span>
    </div>
  );

  return (
    <div style={{ padding: '12px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>Scheletul rutelor — LEAR Florești</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11.5, margin: '3px 0 0', maxWidth: '92ch', lineHeight: 1.45 }}>
            Traseul fix al fiecărei rute din actul de recepție, tur și retur, cu oameni. Kilometrii sunt mediana
            urmei GPS din 16.06–23.09.2026, legată de poartă pe drum — cu ei se compară ziua de mâine.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
          {[
            ['rute măsurate', `${masurate.length}/${schelet.rute.length}`],
            ['mașini', String(masini)],
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
        gridTemplateColumns: ruta ? 'minmax(300px, 340px) 1fr minmax(300px, 340px)' : 'minmax(300px, 340px) 1fr',
        transition: 'grid-template-columns 0.18s ease',
        border: '1px solid var(--border-accent)', borderRadius: 12, overflow: 'hidden',
        background: '#fff', height: 'calc(100vh - 160px)', minHeight: 440,
      }}>
        <div style={{ borderRight: '1px solid var(--border-accent)', overflowY: 'auto' }}>
          {grup('A')}{grup('B')}
        </div>

        <div style={{ position: 'relative' }}>
          <ScheletMap urme={urme} ales={ales} porti={porti} />
          <div style={{
            position: 'absolute', left: 10, bottom: 22, zIndex: 500, background: '#fff',
            border: '1px solid var(--border-accent)', borderRadius: 6, padding: '6px 9px',
            fontSize: 10.5, color: 'var(--text-secondary)',
          }}>
            {(['A', 'B'] as const).map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                <span style={{ display: 'block', width: 18, borderTop: `3px solid ${CULOARE[t]}` }} />
                tura {t}, cu oameni
              </div>
            ))}
          </div>
        </div>

        {ruta && (
          <div style={{ borderLeft: '1px solid var(--border-accent)', overflowY: 'auto', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              {insigna(ruta, true)}
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Ruta {ruta.id}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>{ruta.masina} · {ruta.loc} locuri</span>
            </div>
            <p style={{ fontSize: 12.5, margin: '0 0 8px', lineHeight: 1.4 }}>{ruta.denumire}</p>

            {ruta.capat && (
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
                Capătul pe GPS: <b style={{ color: 'var(--text)' }}>{ruta.capat}</b> — de acolo începe strânsul,
                acolo se termină lăsatul.
              </p>
            )}

            {/* satele din act, cu ce face mașina acolo: % din toate cursele rutei în care oprește cineva */}
            <div style={ETICHETA}>Satele din act · % curse cu oprire</div>
            <ul style={{ listStyle: 'none', margin: '4px 0 10px', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {ruta.sate.map((s) => {
                const p = ruta.opriri?.find((x) => x.n === s)?.p;
                const st = stare(ruta, s);
                return (
                  <li key={s} title={`în ziua desenată: ${st === 'opreste' ? 'oprește' : st === 'trece' ? 'doar trece' : 'nu ajunge'}`} style={{
                    fontSize: 11.5, padding: '2px 7px', borderRadius: 10, lineHeight: 1.4,
                    border: `1px ${st === 'trece' ? 'dashed' : 'solid'} ${p != null && p >= 50 ? 'var(--success)' : 'var(--border-accent)'}`,
                    background: p != null && p >= 50 ? 'rgba(76,107,60,0.12)' : 'transparent',
                    color: st === 'lipseste' ? 'var(--danger)' : 'var(--text)',
                    textDecoration: st === 'lipseste' ? 'line-through' : undefined,
                  }}>
                    {s}{p != null && <b style={{ fontFamily: MONO, fontWeight: 500, fontSize: 10, color: culoareProcent(p), marginLeft: 4 }}>{p}%</b>}
                  </li>
                );
              })}
            </ul>
            {ruta.inPlus && ruta.inPlus.length > 0 && (
              <p style={{ fontSize: 11, color: 'var(--danger)', margin: '0 0 10px', lineHeight: 1.45 }}>
                <span style={{ color: 'var(--text-secondary)' }}>opriri în afara actului: </span>
                {ruta.inPlus.map((x) => `${x.n} ${x.p}%`).join(', ')}
              </p>
            )}

            {ruta.etalon == null ? (
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Nu se poate măsura: nicio cursă din flotă nu s-a potrivit pe ruta asta.
              </p>
            ) : (
              <div style={{ borderTop: '1px solid var(--border-accent)' }}>
                {cifra('tur', nr1(ruta.tur!), 'km cu oameni')}
                {cifra('retur', nr1(ruta.retur!), 'km cu oameni')}
                {cifra('etalon', nr1(ruta.etalon), 'km pe sens', CULOARE[ruta.tura])}
                {cifra('abatere tur/retur', `${ruta.dif}%`, `ziua desenată ${ruta.zi ? zz(ruta.zi) : ''} · ${ruta.zile} zile măsurate`,
                  (ruta.dif ?? 0) <= 5 ? 'var(--success)' : (ruta.dif ?? 0) <= 10 ? undefined : 'var(--danger)')}
              </div>
            )}
          </div>
        )}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 8, maxWidth: '150ch', lineHeight: 1.5 }}>
        Capătul e primul sat din denumirea rutei (la A2 fixat pe GPS la Cuhureștii de Sus: din august mașina strânge de acolo).
        Ziua desenată e aleasă dintre zilele în care mașina face ruta până la capăt, la tur și la retur, trece prin satele
        în care oprește de obicei și are turul egal cu returul; etalonul e mediana acestor zile. Procentul de lângă sat e din toate
        cursele rutei: în câte oprește cineva acolo, numărat doar pe drumul cu oameni. Drumul gol de acasă până la capăt nu e în schelet.
      </p>
    </div>
  );
}
