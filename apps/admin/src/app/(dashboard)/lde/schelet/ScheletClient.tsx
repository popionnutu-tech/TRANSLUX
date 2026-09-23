'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Punct, UrmaRuta } from '@/components/ScheletMap';

const ScheletMap = dynamic(() => import('@/components/ScheletMap'), {
  ssr: false,
  loading: () => <div className="text-muted" style={{ padding: 16 }}>Se încarcă harta…</div>,
});

export type Bucata = { gol: Punct[]; plin: Punct[]; sate: { n: string; c: Punct }[] };
export type Ruta = {
  id: string; tura: 'A' | 'B'; nr: number; loc: number; sate: string[];
  capat?: string; tur?: number; retur?: number; etalon?: number; gol?: number;
  dif?: number; zile?: number; g?: { tur?: Bucata; retur?: Bucata };
};
export type Schelet = { fixat: string; orbe: string[]; rute: Ruta[] };

// Ion, 23.09.2026: «culorile rutei reieșind din tip auto folosit, 20-23 locuri un tip, 27 alt,
// 60 alt». Capacitatea spune ce fel de mașină îi trebuie rutei, deci ea dă culoarea — nu tura.
const CLASE = [
  { test: (l: number) => l <= 23, eticheta: '20–23 locuri', culoare: '#2f6f68' },
  { test: (l: number) => l === 27, eticheta: '27 locuri', culoare: '#b06a1f' },
  { test: (l: number) => l >= 60, eticheta: '60 locuri', culoare: '#3c5795' },
];
const culoarea = (loc: number) => (CLASE.find((c) => c.test(loc)) ?? CLASE[0]).culoare;
const km = (x: number) => `${(Math.round(x * 10) / 10).toFixed(1).replace('.', ',')} km`;

export default function ScheletClient({ schelet }: { schelet: Schelet }) {
  const [ales, setAles] = useState<string | null>(null);
  const orbe = useMemo(() => new Set(schelet.orbe), [schelet.orbe]);

  const masurate = schelet.rute.filter((r) => r.etalon != null);
  const kmPlin = masurate.reduce((s, r) => s + (r.etalon ?? 0) * 2, 0);

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

  const rand = (r: Ruta) => {
    const deschis = r.id === ales;
    const c = culoarea(r.loc);
    return (
      <div key={r.id} style={{ borderBottom: '1px solid var(--border, #e5e5e5)' }}>
        <button
          onClick={() => setAles(deschis ? null : r.id)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', background: deschis ? 'var(--bg-elevated, #f8f8f8)' : 'none',
            border: 0, borderLeft: `4px solid ${r.etalon == null ? 'transparent' : c}`,
            padding: '9px 12px', cursor: 'pointer', font: 'inherit', color: 'inherit',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 700,
              color: r.etalon == null ? 'var(--text-muted, #888)' : c, minWidth: 26,
            }}>{r.id}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {r.capat ?? r.sate[0]} <span style={{ color: 'var(--text-muted, #888)', fontWeight: 400 }}>→ LEAR</span>
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted, #888)', marginTop: 3, fontFamily: 'var(--font-mono, monospace)' }}>
            {r.loc} locuri
            {r.etalon != null
              ? ` · ${km(r.etalon)} pe sens`
              : ' · fără măsurare'}
          </div>
        </button>

        {deschis && (
          <div style={{ padding: '4px 12px 14px 16px', fontSize: 13 }}>
            {r.capat && (
              <p style={{ color: 'var(--text-muted, #888)', margin: '0 0 8px' }}>
                Strânsul începe la <b style={{ color: 'var(--text, #222)' }}>{r.capat}</b>; de acolo mai departe, până la uzină, e ruta.
              </p>
            )}
            <ol style={{ listStyle: 'none', margin: '0 0 12px', padding: '0 0 0 12px', borderLeft: '2px solid var(--border, #e5e5e5)' }}>
              {[...r.sate, 'LEAR'].map((s) => {
                const uzina = s === 'LEAR';
                const capat = s === r.capat;
                const oarb = orbe.has(s);
                return (
                  <li key={s} style={{
                    padding: '2px 0', position: 'relative',
                    color: uzina || capat ? 'var(--text, #222)' : 'var(--text-muted, #888)',
                    fontWeight: uzina || capat ? 600 : 400,
                    textDecoration: oarb ? 'line-through' : undefined,
                    opacity: oarb ? 0.5 : 1,
                  }}>
                    <span style={{
                      position: 'absolute', left: -17, top: 8, width: capat || uzina ? 9 : 6,
                      height: capat || uzina ? 9 : 6, borderRadius: '50%',
                      background: uzina ? '#111' : capat ? c : 'var(--border, #ddd)',
                    }} />
                    {s}
                  </li>
                );
              })}
            </ol>

            {r.etalon == null ? (
              <p style={{ color: 'var(--text-muted, #888)', margin: 0 }}>
                {r.sate.some((s) => orbe.has(s))
                  ? `Nu se poate măsura: ${r.sate.filter((s) => orbe.has(s)).join(', ')} — sate fără coordonate în indexul de localități.`
                  : 'Nu se poate măsura: nicio cursă din flotă nu s-a potrivit pe ruta asta.'}
              </p>
            ) : (
              <table style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
                <tbody>
                  {[
                    ['Tur', km(r.tur!), 'cu oameni'],
                    ['Retur', km(r.retur!), 'cu oameni'],
                    ['Etalon', km(r.etalon), 'pe sens'],
                    ['Abatere', `${r.dif}%`, `tur față de retur, pe ${r.zile} zile`],
                  ].map(([et, val, sub], i) => (
                    <tr key={et} style={{ borderTop: i ? '1px solid var(--border, #eee)' : undefined }}>
                      <td style={{ padding: '4px 0', color: 'var(--text-muted, #888)', width: 66 }}>{et}</td>
                      <td style={{
                        padding: '4px 8px 4px 0', fontWeight: 600, whiteSpace: 'nowrap',
                        color: et === 'Etalon' ? c
                          : et === 'Abatere' ? ((r.dif ?? 0) <= 5 ? 'var(--success, #16a34a)' : (r.dif ?? 0) <= 10 ? 'inherit' : 'var(--danger, #ef4444)')
                          : 'inherit',
                      }}>{val}</td>
                      <td style={{ padding: '4px 0', color: 'var(--text-muted, #888)' }}>{sub}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    );
  };

  const grup = (t: 'A' | 'B') => {
    const rute = schelet.rute.filter((r) => r.tura === t);
    const locuri = rute.reduce((s, r) => s + r.loc, 0);
    return (
      <div key={t}>
        <div style={{
          padding: '8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', color: 'var(--text-muted, #888)',
          background: 'var(--bg-elevated, #f8f8f8)', borderBottom: '1px solid var(--border, #e5e5e5)',
          position: 'sticky', top: 0, zIndex: 1,
        }}>
          Tura {t} · {rute.length} rute · {locuri} locuri
        </div>
        {rute.map(rand)}
      </div>
    );
  };

  return (
    <div className="page-wide">
      <div className="page-header">
        <h1>Scheletul rutelor — LEAR Ungheni</h1>
        <p className="text-muted" style={{ maxWidth: '78ch', marginTop: 4 }}>
          Traseul fix al fiecărei rute: de unde începe strânsul, pe unde merge, câți kilometri are.
          Kilometrii sunt mediana pe trei luni de urmă GPS, nu cifra unei zile — cu ei se compară ziua de mâine.
        </p>
      </div>

      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div className="summary-card card">
          <div className="value">{masurate.length}<span style={{ fontSize: 18, opacity: 0.5 }}>/{schelet.rute.length}</span></div>
          <div className="label">rute măsurate</div>
        </div>
        <div className="summary-card card">
          <div className="value">{Math.round(kmPlin).toLocaleString('ro-RO')}</div>
          <div className="label">km cu oameni pe zi</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 340px) 1fr', minHeight: 560 }}>
          <div style={{ borderRight: '1px solid var(--border, #e5e5e5)', maxHeight: '74vh', overflowY: 'auto' }}>
            {grup('A')}
            {grup('B')}
          </div>
          <div style={{ position: 'relative', minHeight: 560 }}>
            <ScheletMap urme={urme} ales={ales} />
            <div style={{
              position: 'absolute', left: 12, bottom: 24, zIndex: 500,
              background: '#fff', border: '1px solid var(--border, #e5e5e5)',
              borderRadius: 6, padding: '8px 10px', fontSize: 12, lineHeight: 1.7,
            }}>
              {CLASE.map((c) => (
                <div key={c.eticheta} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ display: 'block', width: 20, borderTop: `4px solid ${c.culoare}` }} />
                  {c.eticheta}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 12.5, marginTop: 12, maxWidth: '100ch' }}>
        Scheletul e fixat la {schelet.fixat}. O zi intră în etalon doar dacă are și tur, și retur, și amândouă ajung
        până la capăt — altfel s-ar măsura o zi ciuntită, nu ruta; din zilele rămase se ia mediana, nu media.
        Satele prin care autobuzul doar trece, fără să oprească, se numără la fel ca opririle: fără asta capătul
        cădea cu zeci de kilometri mai aproape. Satele tăiate n-au coordonate în indexul de localități:{' '}
        {schelet.orbe.join(', ')}.
      </p>
    </div>
  );
}
