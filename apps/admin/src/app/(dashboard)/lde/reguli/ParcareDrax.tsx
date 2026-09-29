'use client';

// Parcarea propusă (ION-136, 29.09.2026) — cifra principală a raportului Drăxlmaier, în locul «zilei ideale». Doar afișare: date.parcare.
import { Fragment, useState, type ReactNode } from 'react';
import { canonPlaca } from '@/lib/lde/tip-masina';
import { culoareLoc, randuriParcare, type ParcareDrax as Parcare } from '@/lib/lde/drax-parcare';

const n0 = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ro-RO'));
const VERDE = 'text-[#1f7a4d] dark:text-[#6fd3a0]';
const ZILE = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
const eticZi = (z: string) => { const d = new Date(`${z}T12:00:00Z`); return `${ZILE[d.getUTCDay()]} ${z.slice(8, 10)}.${z.slice(5, 7)}`; };

function Card({ titlu, val, unit, sub, mare }: { titlu: string; val: string; unit: string; sub: string; mare?: boolean }) {
  return (
    <div className={`rounded-[12px] border bg-white px-4! py-3! dark:bg-neutral-900 ${mare ? 'border-[#1f7a4d]/40' : 'border-neutral-200 dark:border-neutral-700'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{titlu}</div>
      <div className="mt-1! flex items-baseline gap-2">
        <b className={`font-mono text-[24px] leading-none tabular-nums ${mare ? VERDE : ''}`}>{val}</b>
        <span className="text-[13px] text-neutral-500">{unit}</span>
      </div>
      <div className="mt-1! text-[12px] leading-snug text-neutral-500">{sub}</div>
    </div>
  );
}

function Loc({ nr, n }: { nr: number; n: string }) {
  return (
    <span className="mr-2! inline-flex items-center gap-1 whitespace-nowrap">
      <b className="rounded-[4px] px-1! font-mono text-[10.5px] text-white" style={{ background: culoareLoc(nr) }}>P{nr}</b>{n}
    </span>
  );
}

export default function ParcareDrax({ p, sapt, tipuri = {}, zile }: { p: Parcare | null; sapt: string; tipuri?: Record<string, string>; zile?: (placa: string) => ReactNode }) {
  const [deschis, setDeschis] = useState<string | null>(null);
  if (!p) return <p className="mt-9! text-[12.5px] text-neutral-500">Parcarea propusă: lipsă pentru săptămâna aceasta (rândul e de dinainte de 29.09.2026 sau pasul nu s-a calculat).</p>;
  const f = p.flota, rows = randuriParcare(p);
  return (
    <section className="mt-9!">
      <div className="mb-3! flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Parcarea propusă · km de tăiat pe săptămână</h2>
        <span className="text-[12px] text-neutral-500">un loc de parcare pe mașină (două, dacă al doilea scade cel puțin {p.parametri.PRAG_AL_DOILEA} km/săpt.)</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card mare titlu="Total de tăiat" val={n0(f.economieSapt)} unit="km/săpt." sub={`Dacă fiecare mașină stă între schimburi și noaptea la locul propus. Măsurat ${n0(f.economieMasurata)} km pe zilele măsurate, adus la 5 zile.`} />
        <Card titlu="Mașini peste 100 km" val={String(f.pestePrag)} unit={`din ${f.masini}`} sub="Mașinile unde parcarea propusă taie cel puțin 100 km pe săptămână." />
        <Card titlu="Cu două locuri" val={String(f.doiLocuri)} unit="mașini" sub="Rutele de dimineață și de seară sunt în zone diferite: un loc pentru fiecare zonă." />
      </div>
      <p className="mt-4! mb-1! text-[12.5px] text-neutral-600 dark:text-neutral-300">
        Mașina merge de la capătul cursei la locul de parcare, așteaptă acolo, apoi pleacă la cursa următoare; tur și retur la uzină rămân la uzină; plimbatul prin
        Bălți și pe la capăt e muncă. Locul e ales dintre orașele și satele din zona rutelor și casa șoferului; la scor apropiat, locul unde mașina deja stă sau un oraș.
        «Rămâne la uzină» nu se propune (Bălți doar unde mașina deja stă). Drumul șoferului spre casă nu e socotit. Apasă pe mașină pentru zile; «pe hartă» arată locurile.
      </p>
      <div className="overflow-x-auto rounded-[12px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-[#9B1B30]/[0.04] text-left align-bottom text-[11.5px] leading-tight text-neutral-500">
              <th className="min-w-[150px] px-2! py-1.5! font-semibold">Mașina</th>
              <th className="min-w-[240px] px-2! py-1.5! font-semibold">Parcare propusă</th>
              <th className="px-2! py-1.5! text-right font-semibold">De tăiat<br />km pe săptămână</th>
              <th className="px-2! py-1.5! text-right font-normal">în medie<br />pe zi</th>
              <th className="px-2! py-1.5! text-right font-normal">zile<br />măsurate</th>
              <th className="px-2! py-1.5! font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <Fragment key={m.m}>
                <tr onClick={() => setDeschis(deschis === m.m ? null : m.m)} title="apasă ca să vezi zilele"
                  className={`cursor-pointer border-t border-neutral-100 hover:bg-[#9B1B30]/[0.03] dark:border-neutral-800 ${deschis === m.m ? 'bg-[#9B1B30]/[0.04]' : ''} ${m.economieSapt < 0.5 ? 'text-neutral-400' : ''}`}>
                  <td className="whitespace-nowrap px-2! py-1! font-mono">{m.m}<span className="ml-2! font-sans text-[11px] text-neutral-500">{tipuri[canonPlaca(m.m)] ?? ''}</span></td>
                  <td className="px-2! py-1!">{!m.locuri.length ? <span className="text-neutral-400">{m.motivFara ?? 'nimic de schimbat'}</span> : m.locuri.map((l) => <Loc key={l.nr} nr={l.nr} n={l.n} />)}</td>
                  <td className={`px-2! py-1! text-right font-semibold tabular-nums ${m.economieSapt >= 100 ? VERDE : ''}`}>{m.economieSapt >= 0.5 ? n0(m.economieSapt) : '—'}</td>
                  <td className="px-2! py-1! text-right tabular-nums text-neutral-500">{m.economieSapt >= 0.5 ? n0(m.economieSapt / 5) : '—'}</td>
                  <td className="px-2! py-1! text-right tabular-nums text-neutral-500">{m.zileMasurate}/{m.zileLV}</td>
                  <td className="px-2! py-1!"><a href={`/lde/harta?sapt=${sapt}&m=${m.m}`} onClick={(e) => e.stopPropagation()} className="text-[#1D6B6B] underline">pe hartă</a></td>
                </tr>
                {deschis === m.m && (
                  <tr className="border-t border-neutral-100 dark:border-neutral-800">
                    <td colSpan={6} className="px-3! py-2! text-[12.5px]">
                      <div className="mb-2! flex flex-wrap gap-x-5 gap-y-1">
                        {m.zile.map((d) => (
                          <span key={d.z} className={d.masurata ? '' : 'text-neutral-400'} title={d.masurata ? undefined : `nu intră în calcul${d.motiv ? `: ${d.motiv}` : ''}`}>
                            <b>{eticZi(d.z)}</b> {d.masurata ? `goi ${n0(d.real)} → ${n0(d.propus)} km, de tăiat ${n0(d.economie)}` : '—'}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11.5px] text-neutral-500">
                        {m.unLoc ? `Un singur loc (${m.unLoc.n}): ${n0(m.unLoc.kmSapt)} km de drum prin loc pe săptămână` : ''}{m.doiLocuri ? `; cea mai bună pereche (${m.doiLocuri.n.join(' + ')}): ${n0(m.doiLocuri.kmSapt)} km (−${n0(m.doiLocuri.castig)})` : ''}.
                        {m.idealSapt != null ? ` Maximul teoretic (mașina așteaptă la fiecare capăt): ${n0(m.idealSapt)} km/săpt.` : ''}
                      </p>
                      {zile && <div className="mt-2! border-t border-neutral-100 pt-2! dark:border-neutral-800"><b>Ziua făcută, drum cu drum</b><div className="mt-1!">{zile(m.m)}</div></div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="px-2! py-1.5! text-[11px] text-neutral-500">Verde = peste 100 km/săpt. Km de tăiat = km goi făcuți − km goi cu parcarea propusă, pe zilele măsurate (luni–vineri, fără nopțile în Bălți), adus la 5 zile. Maximul teoretic (ziua ideală) e doar în detaliul mașinii.</p>
      </div>
    </section>
  );
}
