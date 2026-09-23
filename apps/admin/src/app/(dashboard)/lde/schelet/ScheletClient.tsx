'use client';

import { useMemo, useState } from 'react';

export type Punct = [number, number];
export type Bucata = { gol: Punct[]; plin: Punct[]; sate: { n: string; c: Punct }[] };
export type Ruta = {
  id: string; tura: 'A' | 'B'; nr: number; loc: number; sate: string[];
  capat?: string; tur?: number; retur?: number; etalon?: number; gol?: number;
  dif?: number; zile?: number; g?: { tur?: Bucata; retur?: Bucata };
};
export type Schelet = { fixat: string; orbe: string[]; rute: Ruta[] };

const POARTA: Punct = [47.223, 27.8016];

// Ion, 23.09.2026: «culorile rutei reieșind din tip auto folosit, 20-23 locuri un tip, 27 alt,
// 60 alt». Capacitatea rutei spune ce fel de mașină îi trebuie, deci ea dă culoarea — nu tura.
const CLASE = [
  { prag: (l: number) => l <= 23, cheie: 'c20', eticheta: '20–23 locuri', culoare: '#2f6f68' },
  { prag: (l: number) => l === 27, cheie: 'c27', eticheta: '27 locuri', culoare: '#b06a1f' },
  { prag: (l: number) => l >= 60, cheie: 'c60', eticheta: '60 locuri', culoare: '#3c5795' },
];
const culoarea = (loc: number) => (CLASE.find((c) => c.prag(loc)) ?? CLASE[0]).culoare;

const n1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

export default function ScheletClient({ schelet }: { schelet: Schelet }) {
  const [ales, setAles] = useState<string | null>(null);
  const orbe = useMemo(() => new Set(schelet.orbe), [schelet.orbe]);

  const masurate = schelet.rute.filter((r) => r.etalon != null);
  const kmPlin = masurate.reduce((s, r) => s + (r.etalon ?? 0) * 2, 0);
  const kmGol = masurate.reduce((s, r) => s + (r.gol ?? 0), 0);

  // Proiecție simplă: longitudinea strânsă după cosinusul latitudinii medii. La întinderea
  // raionului Ungheni diferența față de o proiecție adevărată e sub lățimea liniei.
  const harta = useMemo(() => {
    let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
    for (const r of schelet.rute) for (const s of ['tur', 'retur'] as const) {
      const b = r.g?.[s]; if (!b) continue;
      for (const p of [...b.gol, ...b.plin]) {
        la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]);
        lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]);
      }
    }
    la0 -= 0.02; la1 += 0.02; lo0 -= 0.03; lo1 += 0.03;
    const kx = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
    const W = 1200, H = Math.round((W * (la1 - la0)) / ((lo1 - lo0) * kx));
    const X = (lo: number) => ((lo - lo0) / (lo1 - lo0)) * W;
    const Y = (la: number) => ((la1 - la) / (la1 - la0)) * H;
    const linia = (p: Punct[]) => (p.length < 2 ? '' : 'M' + p.map((q) => `${X(q[1]).toFixed(1)} ${Y(q[0]).toFixed(1)}`).join('L'));
    const cai: { id: string; fel: 'gol' | 'plin'; d: string; culoare: string }[] = [];
    const sate = new Map<string, { c: Punct; rute: Set<string> }>();
    for (const r of schelet.rute) for (const s of ['tur', 'retur'] as const) {
      const b = r.g?.[s]; if (!b) continue;
      if (b.gol.length > 1) cai.push({ id: r.id, fel: 'gol', d: linia(b.gol), culoare: '#bdb6a8' });
      if (b.plin.length > 1) cai.push({ id: r.id, fel: 'plin', d: linia(b.plin), culoare: culoarea(r.loc) });
      for (const x of b.sate) {
        if (!sate.has(x.n)) sate.set(x.n, { c: x.c, rute: new Set() });
        sate.get(x.n)!.rute.add(r.id);
      }
    }
    const capete = new Set(schelet.rute.map((r) => r.capat).filter(Boolean) as string[]);
    return { W, H, X, Y, cai, sate: [...sate], capete };
  }, [schelet.rute]);

  const ruta = ales ? schelet.rute.find((r) => r.id === ales) ?? null : null;
  const rand = (r: Ruta) => {
    const activ = r.id === ales;
    return (
      <button
        key={r.id}
        onClick={() => setAles(activ ? null : r.id)}
        aria-current={activ}
        className={`w-full text-left px-3 py-2 border-b border-gray-200 transition-colors ${
          activ ? 'bg-amber-50' : 'hover:bg-gray-50'
        } ${r.etalon == null ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold text-white rounded px-1.5 py-1 min-w-[28px] text-center"
            style={{ background: culoarea(r.loc) }}
          >
            {r.id}
          </span>
          <span className="flex-1 truncate font-semibold text-sm">{r.capat ?? r.sate[0]}</span>
          <span className="font-mono text-sm tabular-nums">
            {r.etalon != null ? n1(r.etalon * 2) : '—'}
          </span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {r.loc} locuri · {r.sate.length} sate
          {r.etalon != null ? ` · abatere ${r.dif}%` : ' · fără măsurare'}
        </div>
      </button>
    );
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Scheletul rutelor — LEAR Ungheni</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-[70ch]">
            Traseul fix al fiecărei rute: de unde începe strânsul, pe unde merge, câți kilometri are.
            Kilometrii sunt mediana pe trei luni de urmă GPS, nu cifra unei zile. Cu ei se compară ziua de mâine.
          </p>
        </div>
        <div className="ml-auto flex gap-5 font-mono text-sm tabular-nums">
          <div><span className="text-gray-500 text-xs block">măsurate</span>{masurate.length}/{schelet.rute.length}</div>
          <div><span className="text-gray-500 text-xs block">cu oameni</span>{Math.round(kmPlin).toLocaleString('ro-RO')} km/zi</div>
          <div><span className="text-gray-500 text-xs block">goi</span>{Math.round(kmGol).toLocaleString('ro-RO')} km/zi</div>
          <div><span className="text-gray-500 text-xs block">fixat</span>{schelet.fixat}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr_300px] gap-0 border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="border-r border-gray-200 max-h-[72vh] overflow-auto">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 sticky top-0 bg-white">
            Tura A · {schelet.rute.filter((r) => r.tura === 'A').length} rute
          </div>
          {schelet.rute.filter((r) => r.tura === 'A').map(rand)}
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 sticky top-0 bg-white">
            Tura B · {schelet.rute.filter((r) => r.tura === 'B').length} rute
          </div>
          {schelet.rute.filter((r) => r.tura === 'B').map(rand)}
        </div>

        <div className="relative bg-[#f6f4ef] min-h-[380px]">
          <svg viewBox={`0 0 ${harta.W} ${harta.H}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full block">
            <g>
              {harta.cai.map((c, i) => {
                const sel = ales === c.id;
                const estompat = ales != null && !sel;
                return (
                  <path
                    key={i}
                    d={c.d}
                    fill="none"
                    stroke={c.culoare}
                    strokeWidth={c.fel === 'gol' ? (sel ? 2 : 1.4) : sel ? 4.5 : 2.2}
                    strokeDasharray={c.fel === 'gol' ? '5 4' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={estompat ? 0.07 : sel ? (c.fel === 'gol' ? 0.85 : 1) : c.fel === 'gol' ? 0.4 : 0.26}
                  />
                );
              })}
            </g>
            <g>
              {harta.sate.map(([nume, v]) => {
                const sel = ales != null && v.rute.has(ales);
                if (ales != null && !sel) return null;
                const capat = harta.capete.has(nume);
                return (
                  <g key={nume}>
                    <circle cx={harta.X(v.c[1])} cy={harta.Y(v.c[0])} r={capat ? 4.5 : 2.8}
                      fill="#fffdf8" stroke={capat ? '#b06a1f' : '#6f6b61'} strokeWidth={capat ? 2.2 : 1.2} />
                    <text x={harta.X(v.c[1]) + 7} y={harta.Y(v.c[0]) + 4}
                      fontSize={10.5} fontWeight={600} fill={sel ? '#141c24' : '#6f6b61'}
                      paintOrder="stroke" stroke="#f6f4ef" strokeWidth={3.5}>{nume}</text>
                  </g>
                );
              })}
            </g>
            <g>
              <circle cx={harta.X(POARTA[1])} cy={harta.Y(POARTA[0])} r={6.5} fill="#141c24" />
              <text x={harta.X(POARTA[1]) + 10} y={harta.Y(POARTA[0]) + 4} fontSize={12} fontWeight={700}
                fill="#141c24" paintOrder="stroke" stroke="#f6f4ef" strokeWidth={4}>LEAR</text>
            </g>
          </svg>
          <div className="absolute left-3 bottom-3 bg-white border border-gray-200 rounded px-2.5 py-2 text-xs text-gray-600 space-y-1">
            {CLASE.map((c) => (
              <div key={c.cheie} className="flex items-center gap-2">
                <span className="block w-5 border-t-[3px]" style={{ borderColor: c.culoare }} />
                {c.eticheta}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="block w-5 border-t-2 border-dashed" style={{ borderColor: '#bdb6a8' }} />
              gol, până la capăt
            </div>
          </div>
        </div>

        <div className="border-l border-gray-200 p-4 max-h-[72vh] overflow-auto">
          {!ruta ? (
            <p className="text-sm text-gray-500">
              Alege o rută din stânga ca să-i vezi scheletul: satele în ordine, capătul și kilometrii-etalon.
            </p>
          ) : (
            <>
              <h2 className="flex items-center gap-2 font-semibold mb-2">
                <span className="text-[10px] font-bold text-white rounded px-1.5 py-1"
                  style={{ background: culoarea(ruta.loc) }}>{ruta.id}</span>
                {ruta.loc} locuri
              </h2>
              {ruta.capat && (
                <p className="text-xs text-gray-600 mb-3">
                  Capătul: <b className="text-gray-900">{ruta.capat}</b> — de acolo începe strânsul,
                  acolo se termină lăsatul.
                </p>
              )}
              <ol className="border-l-2 border-gray-200 mb-4">
                {ruta.sate.map((s) => (
                  <li key={s} className={`relative pl-3 py-0.5 text-[13px] ${
                    s === ruta.capat ? 'font-semibold text-gray-900' : 'text-gray-500'
                  } ${orbe.has(s) ? 'line-through opacity-50' : ''}`}>
                    <span className="absolute -left-[5px] top-2.5 w-2 h-2 rounded-full"
                      style={{ background: s === ruta.capat ? culoarea(ruta.loc) : '#e2dcd0' }} />
                    {s}
                  </li>
                ))}
                <li className="relative pl-3 py-0.5 text-[13px] font-bold text-gray-900">
                  <span className="absolute -left-[5px] top-2.5 w-2 h-2 rounded-full bg-gray-900" />
                  LEAR
                </li>
              </ol>
              {ruta.etalon == null ? (
                <p className="text-xs text-gray-500">
                  Ruta n-are măsurare:{' '}
                  {ruta.sate.some((s) => orbe.has(s))
                    ? `${ruta.sate.filter((s) => orbe.has(s)).join(', ')} — sate fără coordonate în indexul de localități.`
                    : 'nicio cursă din flotă nu s-a potrivit pe ea.'}
                </p>
              ) : (
                <dl className="text-sm">
                  {[
                    ['tur', n1(ruta.tur!), 'km cu oameni', ''],
                    ['retur', n1(ruta.retur!), 'km cu oameni', ''],
                    ['etalon', n1(ruta.etalon), 'km pe sens', 'text-amber-700'],
                    ['gol', n1(ruta.gol ?? 0), 'km pe zi', ''],
                    ['abatere tur/retur', `${ruta.dif}%`, `pe ${ruta.zile} zile măsurate`,
                      (ruta.dif ?? 0) <= 5 ? 'text-green-700' : (ruta.dif ?? 0) <= 10 ? '' : 'text-red-700'],
                  ].map(([et, val, sub, cls]) => (
                    <div key={et as string} className="flex items-baseline gap-2 py-1.5 border-t border-gray-200">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 w-24">{et}</dt>
                      <dd className={`font-mono text-base tabular-nums ${cls}`}>{val}</dd>
                      <span className="text-xs text-gray-500">{sub}</span>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 max-w-[100ch]">
        O zi intră în etalon doar dacă are și tur, și retur, și amândouă ajung până la capăt — altfel s-ar măsura
        o zi ciuntită, nu ruta. Din zilele rămase se ia mediana, nu media. Satele prin care autobuzul doar trece,
        fără să oprească, se numără la fel ca opririle: fără asta, capătul cădea cu zeci de kilometri mai aproape.
        Satele tăiate n-au coordonate în indexul de localități: {schelet.orbe.join(', ')}.
      </p>
    </div>
  );
}
