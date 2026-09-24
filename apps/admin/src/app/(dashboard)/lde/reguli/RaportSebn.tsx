import Link from 'next/link';
import type { LivrareRow, BramburaRow } from '@/lib/lde/naveta-image';

// Raportul săptămânal de optimizare SEBN (ION-56). Ion, 24.09.2026: «aici raportul e diferit de
// LEAR, fiindcă nu pot sta auto la uzină; aici optimizare km livrare de acasă până începere cursă
// și km brambura, cum în automatizarea noastră săptămânală».
//
// Cifrele NU se socotesc aici: vin din incarcaLivrare(), aceeași funcție care face posterul de
// livrare din Telegram, deci pagina și posterul nu pot spune lucruri diferite. Sursa e
// lde_route_run, scris în fiecare noapte de worker (km_livrare, km_brambura pe fiecare cursă).

export type SaptSebn = {
  luni: string; duminica: string;
  rows: LivrareRow[]; brambura: BramburaRow[];
  pretMotorina: number; leiImplicit: number;
  alegeri: { luni: string; eticheta: string }[];
};

const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export const eticheta = (luni: string, dum: string) => {
  const a = new Date(`${luni}T12:00:00Z`), b = new Date(`${dum}T12:00:00Z`);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${LUNI[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${LUNI[a.getUTCMonth()]} – ${b.getUTCDate()} ${LUNI[b.getUTCMonth()]}`;
};
// peste pragul posterului — acolo un șofer din satul de start schimbă cel mai mult
const PRAG_ROSU = 50;
const ROSU = 'text-[#8f1d2c] dark:text-[#e0707e]';

export default function RaportSebn({ s }: { s: SaptSebn }) {
  const lei = (r: LivrareRow) => r.naveta_total * (r.lei_km ?? s.leiImplicit);
  const totLiv = s.rows.reduce((a, r) => a + r.naveta_total, 0);
  const totLei = s.rows.reduce((a, r) => a + lei(r), 0);
  const totBr = s.brambura.reduce((a, b) => a + b.km, 0);
  const cuLivrare = s.rows.filter((r) => r.naveta_zi > 0);

  return (
    <section className="px-4! pt-3!">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-[18px] font-semibold">Raportul de optimizare — SEBN · {eticheta(s.luni, s.duminica)}</h1>
        <span className="text-[12px] text-neutral-500">luni–vineri, din urma GPS a fiecărei curse</span>
      </div>
      <nav aria-label="Săptămâna" className="mt-2! flex flex-wrap gap-1.5">
        {s.alegeri.map((a) => (
          <Link key={a.luni} href={`/lde/reguli?uz=sebn&saptamina=${a.luni}`}
            aria-current={a.luni === s.luni ? 'page' : undefined}
            style={{ color: a.luni === s.luni ? '#fff' : 'var(--text-secondary)' }}
            className={`rounded-md border px-2.5! py-0.5! text-[11.5px] no-underline ${a.luni === s.luni
              ? 'border-transparent bg-[var(--primary)]'
              : 'border-neutral-200 dark:border-neutral-700'}`}>{a.eticheta}</Link>
        ))}
      </nav>

      <div className="mt-3! grid gap-3 sm:grid-cols-3">
        {[
          ['Livrare', `${n0(totLiv)} km`, `${cuLivrare.length} mașini fac drum de acasă până la satul de start`],
          ['Economie posibilă', `${n0(totLei)} lei`, `pe săptămână · motorină ${n2(s.pretMotorina)} lei/l (ANRE)`],
          ['Brambura', `${n0(totBr)} km`, `${s.brambura.length} zile-mașină peste ziua obișnuită`],
        ].map(([e, v, sub]) => (
          <div key={e} className="rounded-lg border border-neutral-200 px-4! py-3! dark:border-neutral-700">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500">{e}</div>
            <div className={`mt-1! font-mono text-[24px] leading-none tabular-nums ${e === 'Brambura' && totBr ? ROSU : ''}`}>{v}</div>
            <div className="mt-1.5! text-[12px] text-neutral-500">{sub}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-5! text-[15px] font-semibold">Livrare (подача) · km de acasă până la începerea cursei</h2>
      <p className="mt-1! max-w-[100ch] text-[12.5px] text-neutral-500">
        Livrare = km-ii șoferului în afara rutei (casă – satul de start și înapoi), fără service și fără drumuri neobișnuite.
        Economie = livrare × costul km-ului mașinii (norma ei × prețul ANRE al zilei + reparație + salariu).
        Goi pe rută = întoarcerile goale impuse de ture — ale uzinei, nu se optimizează.
      </p>
      {s.rows.length === 0 ? (
        <p className="mt-2! text-[13px] text-neutral-500">Nicio cursă măsurată în săptămâna asta.</p>
      ) : (
        <div className="mt-2! overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                {['Mașina', 'Ruta', 'Cine (locuiește)', 'Zile', 'Total km/zi', 'Plin/zi', 'Goi pe rută', 'Livrare/zi', 'Livrare, km', 'Economie, lei'].map((h, i) => (
                  <th key={h} className={`border-b border-neutral-200 px-2! py-1.5! font-bold dark:border-neutral-700 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => {
                const mare = r.naveta_zi >= PRAG_ROSU;
                return (
                  <tr key={r.masina + r.ruta} className="border-b border-neutral-100 dark:border-neutral-800">
                    <td className="px-2! py-1.5! whitespace-nowrap">{r.masina}</td>
                    <td className="px-2! py-1.5! font-semibold">{r.ruta}</td>
                    <td className="px-2! py-1.5!">{r.sofer}</td>
                    <td className="px-2! py-1.5! text-right font-mono tabular-nums">{r.zile}</td>
                    <td className="px-2! py-1.5! text-right font-mono tabular-nums">{n0(r.total_zi)}</td>
                    <td className="px-2! py-1.5! text-right font-mono tabular-nums">{n0(r.plin_zi)}</td>
                    <td className="px-2! py-1.5! text-right font-mono tabular-nums text-neutral-400">{n0(r.gol_ruta_zi)}</td>
                    <td className={`px-2! py-1.5! text-right font-mono font-semibold tabular-nums ${mare ? ROSU : ''}`}>{n0(r.naveta_zi)}</td>
                    <td className="px-2! py-1.5! text-right font-mono tabular-nums">{n0(r.naveta_total)}</td>
                    <td className={`px-2! py-1.5! text-right font-mono tabular-nums ${mare ? ROSU : ''}`}>{n0(lei(r))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-2! py-2!" colSpan={8}>Total livrare</td>
                <td className="px-2! py-2! text-right font-mono tabular-nums">{n0(totLiv)}</td>
                <td className={`px-2! py-2! text-right font-mono tabular-nums ${ROSU}`}>{n0(totLei)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <h2 className="mt-6! text-[15px] font-semibold">Km neagreați (brambura)</h2>
      <p className="mt-1! max-w-[100ch] text-[12.5px] text-neutral-500">
        Km în afara rutei peste ziua obișnuită a mașinii (mediana zilelor ei + 15 km), fără drumurile la service; doar zilele cu peste 20 km.
      </p>
      {s.brambura.length === 0 ? (
        <p className="mt-2! text-[13px] text-neutral-500">Nicio zi cu brambura în săptămâna asta.</p>
      ) : (
        <div className="mt-2! overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                {['Ziua', 'Mașina', 'Șofer', 'Unde a fost, în afara rutei · când', 'Km'].map((h, i) => (
                  <th key={h} className={`border-b border-neutral-200 px-2! py-1.5! font-bold dark:border-neutral-700 ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.brambura.map((b) => (
                <tr key={b.masina + b.data} className="border-b border-neutral-100 dark:border-neutral-800">
                  <td className="px-2! py-1.5! font-mono whitespace-nowrap">{b.data.slice(8, 10)}.{b.data.slice(5, 7)}</td>
                  <td className="px-2! py-1.5! whitespace-nowrap">{b.masina}</td>
                  <td className="px-2! py-1.5!">{b.sofer}</td>
                  <td className="px-2! py-1.5! text-neutral-600 dark:text-neutral-300">{b.unde || '—'}</td>
                  <td className={`px-2! py-1.5! text-right font-mono font-semibold tabular-nums ${ROSU}`}>{b.km}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <hr className="mt-6! border-neutral-200 dark:border-neutral-700" />
    </section>
  );
}
