'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Punct, UrmaRuta } from '@/components/ScheletMap';

const ScheletMap = dynamic(() => import('@/components/ScheletMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Se încarcă harta…</div>,
});

export type Bucata = { gol: Punct[]; plin: Punct[]; sate: { n: string; c: Punct }[] };
export type Ruta = {
  id: string; tura: 'A' | 'B'; nr: number; loc: number; sate: string[];
  capat?: string; tur?: number; retur?: number; etalon?: number; gol?: number;
  dif?: number; zile?: number; g?: { tur?: Bucata; retur?: Bucata };
};
export type Schelet = { fixat: string; orbe: string[]; rute: Ruta[] };

// Ion, 23.09.2026: «culorile rutei reieșind din tip auto folosit, 20-23 locuri un tip, 27 alt,
// 60 alt». Capacitatea spune ce fel de mașină îi trebuie rutei, deci ea dă culoarea rutei.
// Restul paginii rămâne în paleta casei — alb și burgundiu.
const CLASE = [
  { test: (l: number) => l <= 23, eticheta: '20–23 locuri', culoare: '#2F6F68' },
  { test: (l: number) => l === 27, eticheta: '27 locuri', culoare: '#B06A1F' },
  { test: (l: number) => l >= 60, eticheta: '60 locuri', culoare: '#3C5795' },
];
const culoarea = (loc: number) => (CLASE.find((c) => c.test(loc)) ?? CLASE[0]).culoare;
const nr1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

const MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const ETICHETA: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};

export default function ScheletClient({ schelet }: { schelet: Schelet }) {
  const [ales, setAles] = useState<string | null>(null);

  // Harta și cele două panouri au nevoie de toată lățimea, deci pagina cere barei laterale să
  // se strângă cât stă deschisă. Preferința omului nu se atinge — la ieșire se pune la loc,
  // iar dacă o deschide el cu butonul, rămâne deschisă.
  useEffect(() => {
    const cere = (strange: boolean) => {
      window.dispatchEvent(new CustomEvent('tlx:bara', { detail: { strange } }));
    };
    cere(true);
    return () => cere(false);
  }, []);
  const orbe = useMemo(() => new Set(schelet.orbe), [schelet.orbe]);

  const masurate = schelet.rute.filter((r) => r.etalon != null);
  const kmZi = masurate.reduce((s, r) => s + (r.etalon ?? 0) * 2, 0);
  const locuri = schelet.rute.reduce((s, r) => s + r.loc, 0);

  const urme: UrmaRuta[] = useMemo(
    () => schelet.rute.filter((r) => r.g).map((r) => ({
      id: r.id,
      culoare: culoarea(r.loc),
      capat: r.capat,
      plin: [r.g?.tur?.plin, r.g?.retur?.plin].filter((x): x is Punct[] => !!x && x.length > 1),
      sate: [...(r.g?.tur?.sate ?? []), ...(r.g?.retur?.sate ?? [])],
    })),
    [schelet.rute],
  );

  const ruta = ales ? schelet.rute.find((r) => r.id === ales) ?? null : null;

  const insigna = (r: Ruta, mare = false) => (
    <span style={{
      fontFamily: MONO, fontSize: mare ? 11 : 10, fontWeight: 700, color: '#fff',
      background: r.etalon == null ? '#c5b9bc' : culoarea(r.loc),
      borderRadius: 4, padding: mare ? '3px 6px' : '2px 4px', minWidth: mare ? 27 : 23,
      textAlign: 'center', flexShrink: 0,
    }}>{r.id}</span>
  );

  const rand = (r: Ruta) => {
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
            flex: 1, fontSize: 13, fontWeight: 600,
            color: r.etalon == null ? 'var(--text-secondary)' : 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{r.capat ?? r.sate[0]}</span>
          <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {r.etalon != null ? nr1(r.etalon * 2) : '—'}
          </span>
          <span style={{ fontSize: 9.5, color: 'var(--text-muted)', width: 13 }}>
            {r.etalon != null ? 'km' : ''}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1, paddingLeft: 30 }}>
          {r.loc} locuri · {r.sate.length} sate · {r.etalon != null ? `abatere ${r.dif}%` : 'fără măsurare'}
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
          <h1 style={{ fontSize: 18, margin: 0 }}>Scheletul rutelor — LEAR Ungheni</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11.5, margin: '3px 0 0', maxWidth: '92ch', lineHeight: 1.45 }}>
            Traseul fix al fiecărei rute: de unde începe strânsul, pe unde merge, câți kilometri are.
            Kilometrii sunt mediana pe trei luni de urmă GPS, nu cifra unei zile — cu ei se compară ziua de mâine.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
          {[
            ['rute măsurate', `${masurate.length}/${schelet.rute.length}`],
            ['km cu oameni', `${Math.round(kmZi).toLocaleString('ro-RO')}/zi`],
            ['locuri', String(locuri)],
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
        // Ion, 23.09: «asta apare doar când o rută o apăs». Până la apăsare panoul din dreapta
        // stătea gol și lua 320 de pixeli din hartă; acum coloana nici nu există.
        display: 'grid',
        gridTemplateColumns: ruta ? 'minmax(280px, 320px) 1fr minmax(280px, 320px)' : 'minmax(280px, 320px) 1fr',
        transition: 'grid-template-columns 0.18s ease',
        border: '1px solid var(--border-accent)', borderRadius: 12, overflow: 'hidden',
        background: '#fff', height: 'calc(100vh - 128px)', minHeight: 440,
      }}>
        <div style={{ borderRight: '1px solid var(--border-accent)', overflowY: 'auto' }}>
          {grup('A')}{grup('B')}
        </div>

        <div style={{ position: 'relative' }}>
          <ScheletMap urme={urme} ales={ales} />
          <div style={{
            position: 'absolute', left: 10, bottom: 22, zIndex: 500, background: '#fff',
            border: '1px solid var(--border-accent)', borderRadius: 6, padding: '6px 9px',
            fontSize: 10.5, color: 'var(--text-secondary)',
          }}>
            {CLASE.map((c) => (
              <div key={c.eticheta} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                <span style={{ display: 'block', width: 18, borderTop: `3px solid ${c.culoare}` }} />
                {c.eticheta}
              </div>
            ))}
          </div>
        </div>

        {ruta && (
        <div style={{ borderLeft: '1px solid var(--border-accent)', overflowY: 'auto', padding: '12px 14px' }}>
          {(
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                {insigna(ruta, true)}
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ruta.loc} locuri</span>
              </div>

              {ruta.capat && (
                <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
                  Capătul: <b style={{ color: 'var(--text)' }}>{ruta.capat}</b> — de acolo începe strânsul,
                  acolo se termină lăsatul.
                </p>
              )}

              <ol style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
                {[...ruta.sate, 'LEAR'].map((s) => {
                  const uzina = s === 'LEAR';
                  const capat = s === ruta.capat;
                  const oarb = orbe.has(s);
                  return (
                    <li key={s} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0',
                      fontSize: 12.5,
                      fontWeight: uzina || capat ? 600 : 400,
                      color: uzina || capat ? 'var(--text)' : 'var(--text-secondary)',
                      textDecoration: oarb ? 'line-through' : undefined,
                      opacity: oarb ? 0.55 : 1,
                    }}>
                      <span style={{
                        width: capat || uzina ? 9 : 6, height: capat || uzina ? 9 : 6,
                        borderRadius: '50%', flexShrink: 0,
                        background: uzina ? '#23191B' : capat ? culoarea(ruta.loc) : 'var(--border-accent)',
                        border: uzina || capat ? 'none' : '1px solid var(--border-accent)',
                      }} />
                      {s}
                    </li>
                  );
                })}
              </ol>

              {ruta.etalon == null ? (
                <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {ruta.sate.some((s) => orbe.has(s))
                    ? `Nu se poate măsura: ${ruta.sate.filter((s) => orbe.has(s)).join(', ')} — sate fără coordonate în indexul de localități.`
                    : 'Nu se poate măsura: nicio cursă din flotă nu s-a potrivit pe ruta asta.'}
                </p>
              ) : (
                <div style={{ borderTop: '1px solid var(--border-accent)' }}>
                  {cifra('tur', nr1(ruta.tur!), 'km cu oameni')}
                  {cifra('retur', nr1(ruta.retur!), 'km cu oameni')}
                  {cifra('etalon', nr1(ruta.etalon), 'km pe sens', culoarea(ruta.loc))}
                  {cifra('abatere tur/retur', `${ruta.dif}%`, `pe ${ruta.zile} zile măsurate`,
                    (ruta.dif ?? 0) <= 5 ? 'var(--success)' : (ruta.dif ?? 0) <= 10 ? undefined : 'var(--danger)')}
                </div>
              )}
            </>
          )}
        </div>
        )}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 8, maxWidth: '150ch', lineHeight: 1.5 }}>
        O zi intră în etalon doar dacă are și tur, și retur, și amândouă ajung până la capăt — altfel s-ar măsura o zi
        ciuntită, nu ruta; din zilele rămase se ia mediana, nu media. Satele prin care autobuzul doar trece, fără să
        oprească, se numără la fel ca opririle: fără asta capătul cădea cu zeci de kilometri mai aproape.
        Satele tăiate n-au coordonate în indexul de localități: {schelet.orbe.join(', ')}.
      </p>
    </div>
  );
}
