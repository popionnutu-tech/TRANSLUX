'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Raport, MasinaRand } from './actions';

// Raportul săptămânal al celor trei reguli (ION-48). Regulile sunt ale lui Ion:
//   1. mașina doarme la uzină, fiecare rută se face de patru ori
//   3. nu pleacă acasă între schimburi — așteaptă la uzină
// Ele se bat pe aceeași mașină și NU se adună: mașina ori doarme la uzină, ori acasă.
//
// Ion, 24.09: «când apăs pe mașină să se deschidă analitica». Deci rândul se deschide și arată
// ziua în bare plus aritmetica, fiecare cifră scrisă ca adunare înainte de a fi folosită — a doua
// lui observație din aceeași zi: «aici nu corect formula regula 1», unde lipsea pasul din mijloc.

const n1 = (x: number | null | undefined) =>
  x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const n2 = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(2).replace('.', ','));
const n0 = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ro-RO'));
const ZI = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' });

const cel = (m: MasinaRand) => Math.max(m.r1?.lei ?? -1e9, m.r3?.lei ?? -1e9);

function Bara({ titlu, total, parti, max }: {
  titlu: string; total: number; max: number;
  parti: [number, string, string][];
}) {
  const vizibile = parti.filter(([km]) => km > 0.05);
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{titlu}</span>
        <b className="font-mono text-sm tabular-nums">{n1(total)} km</b>
      </div>
      <div className="flex h-4 overflow-hidden bg-neutral-200 dark:bg-neutral-700">
        {vizibile.map(([km, cls], i) => (
          <i key={i} className={cls} style={{ width: `${((km / max) * 100).toFixed(2)}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-neutral-500">
        {vizibile.map(([km, cls, eticheta], i) => (
          <span key={i}>
            <em className={`mr-1.5 inline-block h-2.5 w-2.5 not-italic ${cls}`} />
            {eticheta} <b className="font-mono text-neutral-900 dark:text-neutral-100">{n1(km)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function Mat({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 font-mono text-[12.5px] leading-7 tabular-nums text-neutral-500">{children}</div>;
}
const Et = ({ children }: { children: React.ReactNode }) => (
  <span className="mr-2 text-[9.5px] font-semibold uppercase tracking-wider opacity-70">{children}</span>
);
const Rez = ({ children }: { children: React.ReactNode }) => (
  <b className="font-medium text-[#9B1B30] dark:text-[#e0788c]">{children}</b>
);
const Sep = () => <span className="mx-2 opacity-40">·</span>;

function Panou({ m, zileLuna }: { m: MasinaRand; zileLuna: number }) {
  if (m.rutele_de_4 == null) {
    return <div className="p-4 text-sm">Ziua ei nu se poate construi — vezi steagurile de mai sus.</div>;
  }
  const plin = m.rutele_de_4 / 2;
  const lu = m.alte_la_uzina ?? 0, pc = m.alte_la_parc ?? 0, ai = m.alte_aiurea ?? 0;
  const golAzi = Math.max(0, m.azi - plin - (m.alte ?? 0));
  const max = Math.max(m.azi, m.r1?.zi ?? 0, m.r3?.zi ?? 0);
  const alteP: [number, string, string][] = [
    [lu, 'bg-[#6e8fa8]', 'alte curse, pe la uzină'],
    [pc, 'bg-[#9a8bb0]', 'drum la parcul de la Bălți — reparație'],
    [ai, 'bg-[#8d8378]', 'alte curse, în afara lor'],
  ];
  const et = m.rute.map((r) => n1(r.etalon)).join(' + ');
  return (
    <div className="p-4">
      <Bara titlu="Cum a mers săptămâna trecută" total={m.azi} max={max}
        parti={[[plin, 'bg-[#9B1B30]', 'cu oameni'], [golAzi, 'bg-[#c9a227]', 'gol — spre rute și spre casă'], ...alteP]} />
      {m.r1 && <Bara titlu="Regula 1 — doarme la uzină" total={m.r1.zi} max={max}
        parti={[[plin, 'bg-[#9B1B30]', 'cu oameni'], [plin, 'bg-[#c9a227]', 'gol pe rută, de la uzină'], ...alteP]} />}
      {m.r3 && <Bara titlu="Regula 3 — nu pleacă acasă la prânz" total={m.r3.zi} max={max}
        parti={[[plin, 'bg-[#9B1B30]', 'cu oameni'], [m.d_casa ?? 0, 'bg-[#2f6f68]', 'dimineața de acasă, seara spre casă'],
          [m.d_uzina ?? 0, 'bg-[#c9a227]', 'la prânz, de la uzină'], ...alteP]} />}

      <Mat>
        <Et>rutele</Et>{m.rute.map((r) => `${r.id} ${n1(r.etalon)}`).join(' + ')} = <Rez>{n1(m.d_uzina)} km</Rez>
        <Sep /><Et>cu oameni</Et>2 × ({et}) = <Rez>{n1(plin)}</Rez>
        <Sep /><Et>de 4 ori</Et>4 × ({et}) = <Rez>{n1(m.rutele_de_4)}</Rez>
      </Mat>
      <Mat>
        <Et>alte curse</Et>{n1(lu)} pe la uzină + {n1(pc)} la parc + {n1(ai)} în afara lor = <Rez>{n1(m.alte)}</Rez>
      </Mat>
      {m.d_casa_pe_capat && (
        <Mat>
          <Et>de acasă</Et>{m.d_casa_pe_capat.map((x) => `${x.capat} ${n1(x.km)}`).join(' + ')} = <Rez>{n1(m.d_casa)} km</Rez>
        </Mat>
      )}
      {m.r1 && (
        <Mat>
          <Et>regula 1</Et>ziua {n1(m.rutele_de_4)} + {n1(m.alte)} = <Rez>{n1(m.r1.zi)}</Rez>
          <Sep />{n1(m.azi)} − {n1(m.r1.zi)} = <Rez>{n1(m.r1.km)} km/zi</Rez>
          <Sep />× {n2(m.lei_km)} lei/km × {zileLuna} zile = <Rez>{n0(m.r1.lei)} lei/lună</Rez>
        </Mat>
      )}
      {m.r3 && (
        <Mat>
          <Et>regula 3</Et>ziua {n1(plin)} + {n1(m.d_casa)} + {n1(m.d_uzina)} + {n1(m.alte)} = <Rez>{n1(m.r3.zi)}</Rez>
          <Sep />{n1(m.azi)} − {n1(m.r3.zi)} = <Rez>{n1(m.r3.km)} km/zi</Rez>
          <Sep />× {n2(m.lei_km)} lei/km × {zileLuna} zile = <Rez>{n0(m.r3.lei)} lei/lună</Rez>
        </Mat>
      )}
      {(m.locuri_aiurea ?? []).length > 0 && (
        <>
          <p className="mt-4 text-[13.5px]">
            <b>Unde sunt kilometrii din afara uzinei.</b> Nu apar în lista de deplasări de jos fiindcă
            aceea arată numai ieșirile de peste 15 km, iar aceștia se întâmplă aproape.
          </p>
          <div className="mt-1.5 overflow-x-auto">
            <table className="text-[12px]">
              <tbody>
                {(m.locuri_aiurea ?? []).map((x) => (
                  <tr key={x.loc}>
                    <td className="border-b border-neutral-200 p-1.5 pr-4 dark:border-neutral-700">{x.loc}</td>
                    <td className="border-b border-neutral-200 p-1.5 pr-4 text-right font-mono tabular-nums dark:border-neutral-700">{n1(x.km_zi)} km/zi</td>
                    <td className="border-b border-neutral-200 p-1.5 pr-4 text-right font-mono tabular-nums text-neutral-500 dark:border-neutral-700">{n1(x.ore)} h</td>
                    <td className="border-b border-neutral-200 p-1.5 pr-4 text-right font-mono tabular-nums text-neutral-500 dark:border-neutral-700">{x.zile} zile</td>
                    <td className="border-b border-neutral-200 p-1.5 pr-4 text-right font-mono tabular-nums text-neutral-500 dark:border-neutral-700">{n1(x.de_la_uzina)} km de uzină</td>
                    <td className="border-b border-neutral-200 p-1.5 font-mono text-[11.5px] text-neutral-500 dark:border-neutral-700">
                      {(x.cand ?? []).map((c) => `${String(c.ora).padStart(2, '0')}:00`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {m.km_baza && (
        <p className="mt-3 text-[12.5px] text-neutral-500">
          Controlul km: {n1(m.km_baza.km_aici)} km pe {m.zile_masurate} zile aici, {n1(m.km_baza.km)} pe{' '}
          {m.km_baza.zile} în <code className="bg-neutral-200 px-1 dark:bg-neutral-700">lde_vehicle_gps_daily</code> —{' '}
          {m.km_baza.dif > 0 ? '+' : ''}{n1(m.km_baza.dif)}%.
        </p>
      )}
    </div>
  );
}

export default function ReguliClient({ raport, saptamani = [] }: {
  raport: Raport | null; saptamani?: string[];
}) {
  const [deschis, setDeschis] = useState<string | null>(null);

  // Alegerea săptămânii stă sus, ca prim lucru după titlu. Ion, 24.09: «ar fi bine să fie alegere
  // analitică pe săptămâni sus». Merge prin URL (?saptamina=), nu prin stare locală: linkul către
  // o săptămână anume trebuie să se poată trimite mai departe.
  const Saptamani = () => saptamani.length === 0 ? null : (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Săptămâna</span>
      {saptamani.map((s) => {
        const activ = raport?.saptamina === s;
        return (
          <Link key={s} href={`/lde/reguli?saptamina=${s}`} scroll={false}
            className={`border px-2.5 py-1 font-mono text-[12px] tabular-nums transition-colors ${
              activ
                ? 'border-[#9B1B30] bg-[#9B1B30] text-white'
                : 'border-neutral-200 text-neutral-600 hover:border-[#9B1B30] hover:text-[#9B1B30] dark:border-neutral-700 dark:text-neutral-400'
            }`}>
            {ZI(s)}
          </Link>
        );
      })}
    </div>
  );

  if (!raport) {
    return (
      <div className="p-8">
        <h1 className="mb-2 text-2xl font-bold">Regulile de economie</h1>
        <p className="text-neutral-500">
          Nu există încă niciun raport în <code>lde_analiza_reguli</code>. Îl scrie duminică seara
          workerul <code>lear-analiza.mjs</code> de pe VPS.
        </p>
      </div>
    );
  }

  const R = raport;
  const masini = [...R.masini].sort((a, b) => cel(b) - cel(a));
  const ctrl = R.total.control;

  return (
    <div className="mx-auto max-w-[1160px] p-4 sm:p-6">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight">Regulile de economie · {R.uzina}</h1>
      <p className="mb-4 text-[13.5px] text-neutral-500">
        {ZI(R.saptamina)} – {ZI(R.pana_la)} · comparat cu scheletul fixat pe {R.schelet_fixat} · rulat{' '}
        {new Date(R.rulat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })} ·
        apasă o mașină ca să-i vezi ziua desfăcută
      </p>
      <Saptamani />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-px border border-neutral-200 bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-700">
        {[
          ['regula 1 · la uzină', n0(R.total.r1), `lei pe lună · ${R.total.masini_r1} mașini`, true],
          ['regula 3 · fără drumul de prânz', n0(R.total.r3), `lei pe lună · ${R.total.masini_r3} mașini`, false],
          ['au lucrat la uzină', String(R.total.masini_uzina), 'cel puțin 4 zile la poartă', false],
          ['deplasări peste 15 km', String(R.deplasari.length), 'în afara destinației de lucru', false],
          ['controlul km', ctrl ? `${ctrl.dif > 0 ? '+' : ''}${n1(ctrl.dif)}%` : '—', 'față de workerul de noapte', false],
        ].map(([et, val, sub, mare]) => (
          <div key={et as string} className="bg-white p-3.5 dark:bg-neutral-900">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{et}</span>
            <b className={`block font-mono tabular-nums ${mare ? 'text-[30px] text-[#9B1B30] dark:text-[#e0788c]' : 'text-2xl'}`}>{val}</b>
            <i className="mt-0.5 block text-[12.5px] not-italic text-neutral-500">{sub}</i>
          </div>
        ))}
      </div>

      <p className="mt-3 border-l-[3px] border-neutral-200 pl-4 text-[13.5px] text-neutral-500 dark:border-neutral-700">
        Regulile 1 și 3 se bat pe aceeași mașină și <b className="text-neutral-900 dark:text-neutral-100">nu se adună</b> —
        mașina ori doarme la uzină, ori acasă. Coloana din dreapta spune care îi convine fiecăreia.
        Km-ii sunt socotiți de două coduri care nu se cunosc: aici, din urma GPS brută; în{' '}
        <code>lde_vehicle_gps_daily</code>, de workerul de noapte. Mașina care se abate peste 10% primește steag.
      </p>

      <h2 className="mb-3 mt-9 text-xs font-bold uppercase tracking-widest text-neutral-500">Mașină cu mașină</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-neutral-200 bg-white text-[13px] dark:border-neutral-700 dark:bg-neutral-900">
          <thead>
            <tr className="bg-[#9B1B30]/[0.04]">
              {['Mașina', 'Doarme la', 'Rutele ei', 'Zile', 'km/zi', 'Rutele × 4',
                'Alte · uzină', 'Alte · parc', 'Alte · neatribuiți',
                'Regula 1 lei/lună', 'Regula 3 lei/lună', 'Alege'].map((h, i) => (
                <th key={h} className={`border-b border-neutral-200 p-2 align-bottom text-[10px] font-semibold uppercase leading-tight tracking-wider text-neutral-500 dark:border-neutral-700 ${i >= 3 && i <= 10 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {masini.map((m) => {
              const best = cel(m), care = (m.r1?.lei ?? -1e9) >= (m.r3?.lei ?? -1e9) ? 1 : 3;
              const desc = deschis === m.masina;
              const nr = 'border-b border-neutral-200 p-2 text-right font-mono tabular-nums dark:border-neutral-700';
              return (
                <>
                  <tr key={m.masina}
                    onClick={() => setDeschis(desc ? null : m.masina)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDeschis(desc ? null : m.masina); } }}
                    tabIndex={0} role="button" aria-expanded={desc}
                    className={`cursor-pointer ${best > 0 ? '' : 'opacity-60'} ${desc ? 'bg-[#9B1B30]/[0.07]' : 'hover:bg-[#9B1B30]/[0.04]'}`}>
                    <th scope="row" className="whitespace-nowrap border-b border-neutral-200 p-2 text-left dark:border-neutral-700">
                      <span className="block font-semibold">{m.masina}</span>
                      <span className="mt-0.5 block text-[11px] font-normal text-neutral-500">{m.tip ?? '—'}</span>
                    </th>
                    <td className="whitespace-nowrap border-b border-neutral-200 p-2 text-[12.5px] dark:border-neutral-700">
                      {m.casa ?? '—'}
                      {m.casa_dedusa && <i className="block text-[11px] not-italic text-neutral-500">din urmă</i>}
                    </td>
                    <td className="whitespace-nowrap border-b border-neutral-200 p-2 text-[12px] leading-snug dark:border-neutral-700">
                      {m.rute.map((r) => (
                        <span key={r.id} className="block">
                          <b>{r.id}</b> {r.capat}{' '}
                          <u className="font-mono text-[11px] text-neutral-500 no-underline">{n1(r.etalon)}</u>
                        </span>
                      ))}
                    </td>
                    <td className={nr}>{m.zile_lucrate}</td>
                    <td className={nr}>{n1(m.azi)}</td>
                    <td className={nr}>{n1(m.rutele_de_4)}</td>
                    <td className={`${nr} text-neutral-500`}>{n1(m.alte_la_uzina)}</td>
                    <td className={`${nr} text-neutral-500`}>{n1(m.alte_la_parc)}</td>
                    <td className={`${nr} ${(m.alte_aiurea ?? 0) > 40 ? 'text-[#a33a20]' : 'text-neutral-500'}`}>{n1(m.alte_aiurea)}</td>
                    <td className={`${nr} ${(m.r1?.lei ?? 0) > 0 ? 'font-medium text-[#9B1B30] dark:text-[#e0788c]' : 'text-[#a33a20]'}`}>{n0(m.r1?.lei)}</td>
                    <td className={`${nr} ${(m.r3?.lei ?? 0) > 0 ? 'font-medium text-[#9B1B30] dark:text-[#e0788c]' : 'text-[#a33a20]'}`}>{n0(m.r3?.lei)}</td>
                    <td className="border-b border-neutral-200 p-2 dark:border-neutral-700">
                      {best > 0 ? (
                        <span className={`whitespace-nowrap px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${care === 1 ? 'bg-[#8a5a2b]/20 text-[#8a5a2b] dark:text-[#d0a06a]' : 'bg-[#2f6f68]/20 text-[#2f6f68] dark:text-[#6bb3ac]'}`}>regula {care}</span>
                      ) : <span className="text-neutral-500">—</span>}
                    </td>
                  </tr>
                  {m.steaguri.length > 0 && (
                    <tr key={`${m.masina}-stg`}>
                      <td colSpan={12} className="border-b border-neutral-200 px-2 pb-2 dark:border-neutral-700">
                        {m.steaguri.map((s, i) => (
                          <span key={i} className="block text-[12px] leading-relaxed text-[#a33a20]">⚠ {s}</span>
                        ))}
                      </td>
                    </tr>
                  )}
                  {desc && (
                    <tr key={`${m.masina}-pan`}>
                      <td colSpan={12} className="border-b border-neutral-200 bg-neutral-50 p-0 dark:border-neutral-700 dark:bg-neutral-800">
                        <Panou m={m} zileLuna={R.zile_luna} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {(R.doar_trecute ?? []).length > 0 && (
        <p className="mt-3 border-l-[3px] border-neutral-200 pl-4 text-[13.5px] text-neutral-500 dark:border-neutral-700">
          <b className="text-neutral-900 dark:text-neutral-100">Scoase din raport.</b>{' '}
          {(R.doar_trecute ?? []).map((x) => `${x.masina} a trecut pe la poartă ${x.zile} ${x.zile === 1 ? 'zi' : 'zile'} (${n1(x.ore)} ore)`).join('; ')}.
          {' '}O trecere nu e muncă: în raport intră doar mașinile care au lucrat la uzină, iar asta se vede din urmă, nu din liste.
        </p>
      )}

      {R.steaguri.length > 0 && (
        <>
          <h2 className="mb-3 mt-9 text-xs font-bold uppercase tracking-widest text-neutral-500">De verificat</h2>
          <ul className="list-disc pl-5 text-[13.5px] leading-relaxed text-neutral-500">
            {R.steaguri.map((s, i) => (
              <li key={i}>{s.masina && <b className="text-neutral-900 dark:text-neutral-100">{s.masina}</b>}{s.masina && ' — '}{s.text}</li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mb-3 mt-9 text-xs font-bold uppercase tracking-widest text-neutral-500">
        Deplasări în afara destinației de lucru, peste 15 km
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-neutral-200 bg-white text-[13px] dark:border-neutral-700 dark:bg-neutral-900">
          <thead>
            <tr className="bg-[#9B1B30]/[0.04]">
              {['Ziua', 'Mașina', 'Ora', 'Ore', 'km', 'Cât de departe', 'Unde'].map((h, i) => (
                <th key={h} className={`border-b border-neutral-200 p-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-700 ${i >= 3 && i <= 5 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {R.deplasari.length === 0 && (
              <tr><td colSpan={7} className="p-3 text-neutral-500">Niciuna în săptămâna asta.</td></tr>
            )}
            {R.deplasari.map((d, i) => {
              const nr = 'border-b border-neutral-200 p-2 text-right font-mono tabular-nums dark:border-neutral-700';
              return (
                <tr key={i}>
                  <td className="border-b border-neutral-200 p-2 dark:border-neutral-700">{d.zi}</td>
                  <td className="border-b border-neutral-200 p-2 font-semibold dark:border-neutral-700">{d.masina}</td>
                  <td className={nr}>{d.de_la}–{d.pana_la}</td>
                  <td className={nr}>{n1(d.ore)}</td>
                  <td className={nr}>{n1(d.km)}</td>
                  <td className={nr}>{n1(d.departare)} km</td>
                  <td className="border-b border-neutral-200 p-2 text-[12.5px] dark:border-neutral-700">
                    {d.unde}
                    {d.fel === 'reparație' && <i className="block text-[11px] not-italic text-neutral-500">reparație</i>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-l-[3px] border-neutral-200 pl-4 text-[13.5px] text-neutral-500 dark:border-neutral-700">
        O deplasare intră aici dacă mașina a fost la peste 15 km de tot ce înseamnă lucrul ei: uzina,
        satele rutelor ei din schelet, și satul unde doarme. Se numără o dată pe deplasare, nu pe punct GPS.
        Drumul la parcul de la Bălți se recunoaște singur ca reparație.
      </p>
    </div>
  );
}
