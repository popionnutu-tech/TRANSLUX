'use client';

import { useMemo, useState } from 'react';
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
  fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};

export default function ScheletClient({ schelet }: { schelet: Schelet }) {
  const [ales, setAles] = useState<string | null>(null);
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
      fontFamily: MONO, fontSize: mare ? 12 : 11, fontWeight: 700, color: '#fff',
      background: r.etalon == null ? '#c5b9bc' : culoarea(r.loc),
      borderRadius: 5, padding: mare ? '4px 7px' : '3px 5px', minWidth: mare ? 30 : 26,
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
          padding: '10px 14px', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {insigna(r)}
          <span style={{
            flex: 1, fontSize: 14.5, fontWeight: 600,
            color: r.etalon == null ? 'var(--text-secondary)' : 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{r.capat ?? r.sate[0]}</span>
          <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {r.etalon != null ? nr1(r.etalon * 2) : '—'}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', width: 14 }}>
            {r.etalon != null ? 'km' : ''}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, paddingLeft: 35 }}>
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
          ...ETICHETA, padding: '9px 14px', background: 'var(--bg-elevated)',
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
      display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0',
      borderBottom: '1px solid var(--border-accent)',
    }}>
      <span style={{ ...ETICHETA, width: 78, lineHeight: 1.3 }}>{et}</span>
      <span style={{
        fontFamily: MONO, fontSize: 19, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
        color: culoare ?? 'var(--text)',
      }}>{val}</span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</span>
    </div>
  );

  return (
    <div style={{ padding: '20px 22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 22, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: 0 }}>Scheletul rutelor — LEAR Ungheni</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, margin: '5px 0 0', maxWidth: '74ch' }}>
            Traseul fix al fiecărei rute: de unde începe strânsul, pe unde merge, câți kilometri are.
            Kilometrii sunt mediana pe trei luni de urmă GPS, nu cifra unei zile — cu ei se compară ziua de mâine.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 26, marginLeft: 'auto' }}>
          {[
            ['rute măsurate', `${masurate.length}/${schelet.rute.length}`],
            ['km cu oameni', `${Math.round(kmZi).toLocaleString('ro-RO')}/zi`],
            ['locuri', String(locuri)],
            ['fixat', schelet.fixat],
          ].map(([e, v]) => (
            <div key={e}>
              <div style={ETICHETA}>{e}</div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 500, color: 'var(--primary)', marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr minmax(280px, 320px)',
        border: '1px solid var(--border-accent)', borderRadius: 12, overflow: 'hidden',
        background: '#fff', height: 'calc(100vh - 190px)', minHeight: 520,
      }}>
        <div style={{ borderRight: '1px solid var(--border-accent)', overflowY: 'auto' }}>
          {grup('A')}{grup('B')}
        </div>

        <div style={{ position: 'relative' }}>
          <ScheletMap urme={urme} ales={ales} />
          <div style={{
            position: 'absolute', left: 14, bottom: 26, zIndex: 500, background: '#fff',
            border: '1px solid var(--border-accent)', borderRadius: 8, padding: '9px 12px',
            fontSize: 12, color: 'var(--text-secondary)',
          }}>
            {CLASE.map((c) => (
              <div key={c.eticheta} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                <span style={{ display: 'block', width: 22, borderTop: `4px solid ${c.culoare}` }} />
                {c.eticheta}
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderLeft: '1px solid var(--border-accent)', overflowY: 'auto', padding: '16px 18px' }}>
          {!ruta ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13.5 }}>
              Alege o rută din stânga ca să-i vezi scheletul: satele în ordine, capătul și kilometrii-etalon.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                {insigna(ruta, true)}
                <span style={{ fontSize: 16, fontWeight: 600 }}>{ruta.loc} locuri</span>
              </div>

              {ruta.capat && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
                  Capătul: <b style={{ color: 'var(--text)' }}>{ruta.capat}</b> — de acolo începe strânsul,
                  acolo se termină lăsatul.
                </p>
              )}

              <ol style={{ listStyle: 'none', margin: '0 0 18px', padding: 0 }}>
                {[...ruta.sate, 'LEAR'].map((s) => {
                  const uzina = s === 'LEAR';
                  const capat = s === ruta.capat;
                  const oarb = orbe.has(s);
                  return (
                    <li key={s} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0',
                      fontSize: 14,
                      fontWeight: uzina || capat ? 600 : 400,
                      color: uzina || capat ? 'var(--text)' : 'var(--text-secondary)',
                      textDecoration: oarb ? 'line-through' : undefined,
                      opacity: oarb ? 0.55 : 1,
                    }}>
                      <span style={{
                        width: capat || uzina ? 10 : 7, height: capat || uzina ? 10 : 7,
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
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
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
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 12, maxWidth: '110ch', lineHeight: 1.6 }}>
        O zi intră în etalon doar dacă are și tur, și retur, și amândouă ajung până la capăt — altfel s-ar măsura o zi
        ciuntită, nu ruta; din zilele rămase se ia mediana, nu media. Satele prin care autobuzul doar trece, fără să
        oprească, se numără la fel ca opririle: fără asta capătul cădea cu zeci de kilometri mai aproape.
        Satele tăiate n-au coordonate în indexul de localități: {schelet.orbe.join(', ')}.
      </p>
    </div>
  );
}
