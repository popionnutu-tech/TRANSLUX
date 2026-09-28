'use client';

// Cele 4 reguli de optimizare ale lui Ion (ION-120, 28.09.2026; §8.7). Doar afișare: cifrele sunt ale rândului săptămânii (date.reguli4).
import { canonPlaca } from '@/lib/lde/tip-masina';
import { TITLURI_REGULI4, randuriReguli4, textR1, textR3, textR4, type Reguli4Drax } from '@/lib/lde/drax-reguli4';

const n0 = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ro-RO'));
const VERDE = 'text-[#1f7a4d] dark:text-[#6fd3a0]';

function Regula({ titlu, val, sub }: { titlu: string; val: string; sub: string }) {
  return (
    <div className="rounded-[12px] border border-neutral-200 bg-white p-5! dark:border-neutral-700 dark:bg-neutral-900">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{titlu}</div>
      <div className="mt-2! flex items-baseline gap-2">
        <b className={`font-mono text-[28px] leading-none tabular-nums ${VERDE}`}>{val}</b>
        <span className="text-[13px] text-neutral-500">km/săpt.</span>
      </div>
      <div className="mt-2! text-[12.5px] text-neutral-500">{sub}</div>
    </div>
  );
}

export default function PatruReguli({ r, tipuri = {} }: { r: Reguli4Drax | null; tipuri?: Record<string, string> }) {
  if (!r) return (
    <p className="mt-9! text-[12.5px] text-neutral-500">Cele 4 reguli de optimizare: lipsă pentru săptămâna aceasta (rândul e de dinainte de 28.09.2026 sau pasul nu s-a calculat).</p>
  );
  const f = r.flota, rows = randuriReguli4(r), propuse = r.masini.filter((m) => m.R1?.propus).length;
  return (
    <section className="mt-9!">
      <div className="mb-3! flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Cele 4 reguli de optimizare · km pe săptămână</h2>
        <span className="text-[12px] text-neutral-500">
          împreună (1 + 2 + 4): <b className={VERDE}>{n0(f.sumaPropusa.extrapolat)} km</b> pe săptămână (măsurat {n0(f.sumaPropusa.masurat)} km pe {r.esantion} din {r.zileLV} zile-mașină) · fiecare km într-o singură regulă
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Regula titlu={TITLURI_REGULI4.R1} val={n0(f.R1propus.extrapolat)}
          sub={`Seara ruta se termină în satul din care pleacă dimineața: mașina doarme acolo, nu acasă. Propus la ${propuse} mașini (peste 100 km/săpt.). Nopțile în Bălți nu intră: ${n0(f.balti.extrapolat)} km separat.`} />
        <Regula titlu={TITLURI_REGULI4.R2} val={n0(f.R2.extrapolat)}
          sub="Între turul și returul aceleiași ture mașina așteaptă lângă uzină: km-ii făcuți în afara zonei uzinei (> 3 km de porți și de parc)." />
        <Regula titlu={TITLURI_REGULI4.R3} val={n0(f.R3.net)} sub={textR3(r)} />
        <Regula titlu={TITLURI_REGULI4.R4} val={n0(f.R4.extrapolat)}
          sub="Între schimburi mașina așteaptă la capătul cursei următoare sau la uzină, nu merge acasă: doar km-ii în plus din cauza casei." />
      </div>
      {rows.length > 0 && (
        <div className="mt-4! overflow-x-auto rounded-[12px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#9B1B30]/[0.04] text-left text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                <th className="px-3! py-2!">Mașina</th><th className="px-3! py-2!">1 · Doarme la capăt</th><th className="px-3! py-2! text-right">2 · La uzină</th>
                <th className="px-3! py-2!">4 · Nu pleacă acasă</th><th className="px-3! py-2! text-right">Total 1 + 2 + 4</th><th className="px-3! py-2! text-right">Bălți (separat)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.m} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-3! py-1.5! font-mono">{m.m}<span className="block font-sans text-[11.5px] text-neutral-500">{tipuri[canonPlaca(m.m)] ?? '—'}</span></td>
                  <td className="px-3! py-1.5!">{textR1(m)}</td>
                  <td className="px-3! py-1.5! text-right tabular-nums">{m.R2 >= 0.5 ? n0(m.R2) : '—'}</td>
                  <td className="px-3! py-1.5!">{textR4(m)}</td>
                  <td className={`px-3! py-1.5! text-right font-semibold tabular-nums ${VERDE}`}>{m.total >= 0.5 ? n0(m.total) : '—'}</td>
                  <td className="px-3! py-1.5! text-right tabular-nums text-neutral-500">{m.balti >= 0.5 ? n0(m.balti) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3! py-2! text-[11.5px] text-neutral-500">Km măsurați pe zilele din eșantion; cardurile de sus sunt extrapolate pe toate zilele lucrate. Regula 1 se propune doar mașinilor cu peste 100 km/săpt.; naveta șoferului nu se numără.</p>
        </div>
      )}
    </section>
  );
}
