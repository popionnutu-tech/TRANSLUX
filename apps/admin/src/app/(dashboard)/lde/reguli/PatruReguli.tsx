'use client';

// Cele 4 reguli de optimizare ale lui Ion (ION-120, 28.09.2026; §8.7). Doar afișare: cifrele sunt ale rândului săptămânii (date.reguli4).
import { canonPlaca } from '@/lib/lde/tip-masina';
import { TITLURI_REGULI4, randuriReguli4, textR1, textR3, textR4, type Reguli4Drax } from '@/lib/lde/drax-reguli4';

const n0 = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ro-RO'));
const VERDE = 'text-[#1f7a4d] dark:text-[#6fd3a0]';

function Regula({ titlu, val, sub }: { titlu: string; val: string; sub: string }) {
  return (
    <div className="rounded-[12px] border border-neutral-200 bg-white px-4! py-3! dark:border-neutral-700 dark:bg-neutral-900">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{titlu}</div>
      <div className="mt-1! flex items-baseline gap-2">
        <b className={`font-mono text-[24px] leading-none tabular-nums ${VERDE}`}>{val}</b>
        <span className="text-[13px] text-neutral-500">km/săpt.</span>
      </div>
      <div className="mt-1! text-[12px] leading-snug text-neutral-500">{sub}</div>
    </div>
  );
}

export default function PatruReguli({ r, tipuri = {} }: { r: Reguli4Drax | null; tipuri?: Record<string, string> }) {
  if (!r) return (
    <p className="mt-9! text-[12.5px] text-neutral-500">Cele 4 reguli de optimizare: lipsă pentru săptămâna aceasta (rândul e de dinainte de 28.09.2026 sau pasul nu s-a calculat).</p>
  );
  const f = r.flota, rows = randuriReguli4(r), propuse = r.masini.filter((m) => m.R1?.propus).length, cuBalti = rows.some((m) => m.balti >= 0.5);
  return (
    <section className="mt-9!">
      <div className="mb-3! flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Cele 4 reguli de optimizare · km pe săptămână</h2>
        <span className="text-[12px] text-neutral-500">
          împreună (1 + 2 + 4): <b className={VERDE}>{n0(f.sumaPropusa.extrapolat)} km</b> pe săptămână (măsurat {n0(f.sumaPropusa.masurat)} km pe {r.esantion} din {r.zileLV} zile-mașină) · fiecare km într-o singură regulă
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Regula titlu={TITLURI_REGULI4.R1} val={n0(f.R1propus.extrapolat)}
          sub={`Doarme în satul unde termină seara și pleacă dimineața. ${propuse} mașini (> 100 km/săpt.); Bălți separat: ${n0(f.balti.extrapolat)}.`} />
        <Regula titlu={TITLURI_REGULI4.R2} val={n0(f.R2.extrapolat)}
          sub="Între tur și retur așteaptă lângă uzină (km-ii făcuți la > 3 km de porți)." />
        <Regula titlu={TITLURI_REGULI4.R3} val={n0(f.R3.net)} sub={textR3(r)} />
        <Regula titlu={TITLURI_REGULI4.R4} val={n0(f.R4.extrapolat)}
          sub="Între schimburi așteaptă la capăt sau la uzină, nu acasă (doar ocolul pe acasă)." />
      </div>
      {rows.length > 0 && (
        <div className="mt-3! overflow-x-auto rounded-[12px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-[#9B1B30]/[0.04] text-left text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                <th className="px-2! py-1.5!">Mașina</th><th className="px-2! py-1.5!">1 · Capăt</th><th className="px-2! py-1.5! text-right">2 · Uzină</th>
                <th className="px-2! py-1.5!">4 · Nu acasă</th><th className="px-2! py-1.5! text-right">Total</th>{cuBalti && <th className="px-2! py-1.5! text-right">Bălți</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.m} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="whitespace-nowrap px-2! py-1! font-mono">{m.m}<span className="ml-2! font-sans text-[11px] text-neutral-500">{tipuri[canonPlaca(m.m)] ?? ''}</span></td>
                  <td className="px-2! py-1!">{textR1(m)}</td>
                  <td className="px-2! py-1! text-right tabular-nums">{m.R2 >= 0.5 ? n0(m.R2) : '—'}</td>
                  <td className="px-2! py-1!">{textR4(m)}</td>
                  <td className={`px-2! py-1! text-right font-semibold tabular-nums ${VERDE}`}>{m.total >= 0.5 ? n0(m.total) : '—'}</td>
                  {cuBalti && <td className="px-2! py-1! text-right tabular-nums text-neutral-500">{m.balti >= 0.5 ? n0(m.balti) : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-2! py-1.5! text-[11.5px] text-neutral-500">Km măsurați pe zilele din eșantion; cardurile de sus sunt extrapolate pe toate zilele lucrate. Regula 1 se propune doar mașinilor cu peste 100 km/săpt.; naveta șoferului nu se numără.</p>
        </div>
      )}
    </section>
  );
}
