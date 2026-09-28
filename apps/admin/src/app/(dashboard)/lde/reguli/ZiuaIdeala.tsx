'use client';

// Economia față de «ziua ideală» a mașinii (ION-123, 28.09.2026). Doar afișare: cifrele sunt ale rândului săptămânii (date.ziIdeala).
import { Fragment, useState, type ReactNode } from 'react';
import { canonPlaca } from '@/lib/lde/tip-masina';
import { randuriZiIdeala, textIntervalIdeal, textZiIdeala, type ZiIdealaDrax } from '@/lib/lde/drax-zi-ideala';

const n0 = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ro-RO'));
const VERDE = 'text-[#1f7a4d] dark:text-[#6fd3a0]';
const ROSU = 'text-[#9B1B30] dark:text-[#e0788c]';

function Card({ titlu, val, sub, mare }: { titlu: string; val: string; sub: string; mare?: boolean }) {
  return (
    <div className={`rounded-[12px] border bg-white px-4! py-3! dark:bg-neutral-900 ${mare ? 'border-[#1f7a4d]/40' : 'border-neutral-200 dark:border-neutral-700'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{titlu}</div>
      <div className="mt-1! flex items-baseline gap-2">
        <b className={`font-mono text-[24px] leading-none tabular-nums ${VERDE}`}>{val}</b>
        <span className="text-[13px] text-neutral-500">km/săpt.</span>
      </div>
      <div className="mt-1! text-[12px] leading-snug text-neutral-500">{sub}</div>
    </div>
  );
}

export default function ZiuaIdeala({ z, tipuri = {}, zile }: { z: ZiIdealaDrax | null; tipuri?: Record<string, string>; zile?: (placa: string) => ReactNode }) {
  const [deschis, setDeschis] = useState<string | null>(null);
  if (!z) return <p className="mt-9! text-[12.5px] text-neutral-500">Economia față de ziua ideală: lipsă pentru săptămâna aceasta (rândul e de dinainte de 28.09.2026 sau pasul nu s-a calculat).</p>;
  const f = z.flota, c = f.cauze, rows = randuriZiIdeala(z), factor = f.economie > 0 ? f.extrapolat / f.economie : 1;
  return (
    <section className="mt-9!">
      <div className="mb-3! flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Economie față de ziua ideală · km pe săptămână</h2>
        <span className="text-[12px] text-neutral-500">ziua ideală = cursele și munca + drumul direct între curse + noaptea la capăt · măsurat {n0(f.economie)} km pe {f.zile} zile</span>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Card mare titlu="Total de tăiat" val={n0(f.extrapolat)} sub={`Km făcuți − ziua ideală, pe toate zilele lucrate, cu nopțile de weekend. Separat: nopțile în Bălți ${n0((f.separat.balti?.economie ?? 0) * factor)}.`} />
        <Card titlu="Acasă între curse" val={n0(c.acasa * factor)} sub="Între curse merge acasă în loc să aștepte la capăt sau la uzină (cu tot drumul mai lung prin casă)." />
        <Card titlu="Noaptea departe de capăt" val={n0(c.noapte * factor)} sub="Seara nu rămâne unde termină / de unde pleacă dimineața (și vineri → luni)." />
        <Card titlu="Drum mai lung" val={n0((c.drumLung + c.drumMaiScurt) * factor)} sub={`Mai lung decât drumul direct, fără casă (${n0(c.drumLung * factor)}), minus zilele mai scurte decât idealul (${n0(c.drumMaiScurt * factor)}).`} />
      </div>
      <p className="mt-4! mb-1! text-[12.5px] text-neutral-600 dark:text-neutral-300">
        Pe fiecare mașină: câți km pe săptămână se pot tăia și din ce vin. <b>Total = acasă între curse + noaptea departe de capăt + drum mai lung.</b> Apasă pe mașină ca să vezi ziua ei.
      </p>
      <div className="overflow-x-auto rounded-[12px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-[#9B1B30]/[0.04] text-left align-bottom text-[11.5px] leading-tight text-neutral-500">
              <th className="min-w-[190px] px-2! py-1.5! font-semibold">Mașina</th>
              <th className="px-2! py-1.5! text-right font-semibold">Total de tăiat<br />km pe săptămână</th>
              <th className="px-2! py-1.5! text-right font-normal">din care:<br />acasă între curse</th>
              <th className="px-2! py-1.5! text-right font-normal"><br />noaptea departe de capăt</th>
              <th className="px-2! py-1.5! text-right font-normal"><br />drum mai lung*</th>
              <th className="px-2! py-1.5! text-right font-normal">în medie<br />pe zi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <Fragment key={m.m}>
                <tr onClick={() => setDeschis(deschis === m.m ? null : m.m)} title="apasă ca să vezi ziua ideală față de ziua făcută"
                  className={`cursor-pointer border-t border-neutral-100 hover:bg-[#9B1B30]/[0.03] dark:border-neutral-800 ${deschis === m.m ? 'bg-[#9B1B30]/[0.04]' : ''} ${m.separat ? 'text-neutral-400' : ''}`}>
                  <td className="whitespace-nowrap px-2! py-1! font-mono">{m.m}<span className="ml-2! font-sans text-[11px] text-neutral-500">{tipuri[canonPlaca(m.m)] ?? ''}</span>
                    {m.separat && <span className={`ml-2! font-sans text-[11px] ${ROSU}`}>posibilă cursă nedetectată, în afara totalului</span>}</td>
                  <td className={`px-2! py-1! text-right font-semibold tabular-nums ${m.pestePrag && !m.separat ? VERDE : ''}`}>{n0(m.kmSapt)}</td>
                  <td className="px-2! py-1! text-right tabular-nums">{m.cauze.acasa >= 0.5 ? n0(m.cauze.acasa) : '—'}</td>
                  <td className="px-2! py-1! text-right tabular-nums">{m.cauze.noapte >= 0.5 ? n0(m.cauze.noapte) : '—'}</td>
                  <td className={`px-2! py-1! text-right tabular-nums ${m.cauze.drumLung + m.cauze.drumMaiScurt < 0 ? 'text-neutral-400' : ''}`}
                    title={m.cauze.drumLung + m.cauze.drumMaiScurt < 0 ? 'minus: a mers mai scurt decât drumul socotit ideal; se scade din total' : undefined}>
                    {Math.abs(m.cauze.drumLung + m.cauze.drumMaiScurt) >= 0.5 ? n0(m.cauze.drumLung + m.cauze.drumMaiScurt) : '—'}</td>
                  <td className="px-2! py-1! text-right tabular-nums text-neutral-500">{n0(m.peZi)}</td>
                </tr>
                {deschis === m.m && (
                  <tr className="border-t border-neutral-100 dark:border-neutral-800">
                    <td colSpan={6} className="px-3! py-2! text-[12.5px]">
                      {m.zile.map((d) => (
                        <div key={d.z} className="mb-2!">
                          <b>{textZiIdeala(d)}</b>
                          <ul className="mt-0.5! space-y-0.5! text-neutral-600 dark:text-neutral-300">{d.intervale.filter((i) => i.economie >= 0.5 || i.economie <= -0.5 || i.leg >= 0.5).map((i, k) => <li key={k}>{textIntervalIdeal(i)}</li>)}</ul>
                        </div>
                      ))}
                      {zile && <div className="mt-2! border-t border-neutral-100 pt-2! dark:border-neutral-800"><b>Ziua făcută, drum cu drum</b><div className="mt-1!">{zile(m.m)}</div></div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="px-2! py-1.5! text-[11px] text-neutral-500">* Drum mai lung: km peste drumul direct între curse; minus (gri) = a mers mai scurt decât drumul socotit ideal și se scade. Tabelul: km măsurați pe zilele măsurate (cardurile de sus: pe toate zilele). Verde = peste {z.prag} km/săpt. Drumul direct: real din GPS pe {z.legaturi.gps} din {z.legaturi.perechi} perechi de locuri, restul estimat pe hartă.</p>
      </div>
    </section>
  );
}
