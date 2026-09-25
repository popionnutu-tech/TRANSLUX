// Regulile de optimizare la SEBN (ION-38). Ion, 24.09.2026: «salvează în LDE reguli».
// Nu e raport săptămânal ca la LEAR: regulile sunt fixe, iar cifrele vin din scheletul fixat
// (public/lde/schelet-sebn.json) — naveta fiecărei rute, pe toate schimburile zilei.

export type ReguliSebn = {
  fixat: string;
  schelet_fixat: string;
  reguli: { nr: number; titlu: string; text: string; sursa: string }[];
  naveta: {
    id: string; nume: string; capat: string; uz: string; masini: string[];
    schimburi: number; gol_zi: number; plin_zi: number;
  }[];
  total: { gol_zi: number; plin_zi: number };
};

const n1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
// SEBN lucrează și sâmbăta, și duminica (lde_uzine.works_saturday/sunday)
const ZILE_LUNA = 30;

export default function ReguliSebnClient({ date }: { date: ReguliSebn }) {
  const cuGol = date.naveta.filter((r) => r.gol_zi >= 5);
  const max = Math.max(...date.naveta.map((r) => r.gol_zi), 1);
  const H2 = 'text-xs font-bold uppercase tracking-widest text-neutral-500';
  return (
    <section>
      <div className="mb-3! mt-12! flex flex-wrap items-baseline justify-between gap-2 border-t border-neutral-200 pt-8! dark:border-neutral-700">
        <h2 className={H2}>Regulile de optimizare · etalonul din schelet</h2>
        <span className="text-[12px] text-neutral-500">scheletul fixat pe {date.schelet_fixat}</span>
      </div>
      <p className="max-w-[110ch] text-[12.5px] text-neutral-500">
        Regulile după care se taie kilometrii goi la SEBN. Schimburile sunt trei, la fel, cu predare pe loc — de aceea
        singura pârghie e naveta.
      </p>

      <div className="mt-4! grid gap-3 sm:grid-cols-3">
        {[
          ['Km goi pe zi', `${n0(date.total.gol_zi)} km`, `${Math.round((100 * date.total.gol_zi) / (date.total.gol_zi + date.total.plin_zi))}% din ziua rutelor`],
          ['Pe lună', `${n0(date.total.gol_zi * ZILE_LUNA)} km`, `${ZILE_LUNA} de zile — SEBN lucrează și în weekend`],
          ['Rute cu navetă', `${cuGol.length} din ${date.naveta.length}`, 'peste 5 km goi pe zi'],
        ].map(([e, v, sub]) => (
          <div key={e} className="rounded-[8px] border border-neutral-200 bg-white px-4! py-3! dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-neutral-500">{e}</span>
              <b className="font-mono text-[18px] tabular-nums">{v}</b>
            </div>
            <div className="mt-0.5! text-[11.5px] text-neutral-500">{sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-4! grid gap-4 md:grid-cols-2">
        {date.reguli.map((r) => (
          <div key={r.nr} className="rounded-[8px] border border-neutral-200 bg-white p-4! dark:border-neutral-700 dark:bg-neutral-900">
            <div className="mb-1! flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Regula {r.nr} · {r.titlu}</span>
              <span className="whitespace-nowrap text-[11px] text-neutral-400">{r.sursa}</span>
            </div>
            <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">{r.text}</p>
          </div>
        ))}
      </div>

      <div className="mb-3! mt-9! flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={H2}>Naveta pe rute după schelet · regula 3</h2>
        <span className="text-[12px] text-neutral-500">doar mașinile care fac ruta acum</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse border border-neutral-200 bg-white text-[13px] dark:border-neutral-700 dark:bg-neutral-900">
          <thead>
            <tr className="bg-[#9B1B30]/[0.04]">
              {['Rută', 'Capăt', 'Mașina', 'Sch.', 'Goi km/zi', '', 'Cu oameni km/zi', 'Goi km/lună'].map((h, i) => (
                <th key={i} className={`border-b border-neutral-200 p-2! align-bottom text-[10px] font-semibold uppercase leading-tight tracking-wider text-neutral-500 dark:border-neutral-700 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {date.naveta.map((r) => {
              const c = 'border-b border-neutral-200 p-2! dark:border-neutral-700';
              return (
                <tr key={r.id} className={r.gol_zi < 5 ? 'opacity-60' : ''}>
                  <td className={c}><b>{r.id}</b> {r.nume}</td>
                  <td className={`${c} text-[12.5px]`}>{r.capat}</td>
                  <td className={`${c} font-mono text-[12px] text-neutral-500`}>{r.masini.join(', ')}</td>
                  <td className={`${c} text-right font-mono tabular-nums`}>{r.schimburi}</td>
                  <td className={`${c} text-right font-mono font-semibold tabular-nums`}>{n1(r.gol_zi)}</td>
                  <td className={`${c} w-[120px]`}>
                    <div className="h-1.5 rounded-sm bg-[#9B1B30]" style={{ width: `${(100 * r.gol_zi) / max}%`, opacity: r.gol_zi < 5 ? 0.3 : 0.7 }} />
                  </td>
                  <td className={`${c} text-right font-mono tabular-nums text-neutral-500`}>{n1(r.plin_zi)}</td>
                  <td className={`${c} text-right font-mono tabular-nums`}>{n0(r.gol_zi * ZILE_LUNA)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2! text-[12.5px] text-neutral-500">
        Km goi pe zi = drumul dintre locul unde stă mașina și capătul rutei, pe toate schimburile zilei. E etalonul din
        schelet; ce s-a întâmplat în săptămâna aleasă, cu lei, e în raportul de sus.
      </p>
    </section>
  );
}
