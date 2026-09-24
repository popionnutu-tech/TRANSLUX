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
  return (
    <div className="px-4! py-3!">
      <h1 className="text-[18px] font-semibold">Regulile de optimizare — SEBN Orhei și Strășeni</h1>
      <p className="mt-1! max-w-[92ch] text-[12.5px] text-neutral-500">
        Regulile după care se taie kilometrii goi la SEBN, și cifrele lor din scheletul fixat pe {date.schelet_fixat}.
        La SEBN schimburile sunt trei, la fel, cu predare pe loc — de aceea singura pârghie e naveta.
      </p>

      <div className="mt-4! grid gap-3 sm:grid-cols-3">
        {[
          ['Km goi pe zi', `${n0(date.total.gol_zi)} km`, `${Math.round((100 * date.total.gol_zi) / (date.total.gol_zi + date.total.plin_zi))}% din ziua rutelor`],
          ['Pe lună', `${n0(date.total.gol_zi * ZILE_LUNA)} km`, `${ZILE_LUNA} de zile — SEBN lucrează și în weekend`],
          ['Rute cu navetă', `${cuGol.length} din ${date.naveta.length}`, 'peste 5 km goi pe zi'],
        ].map(([e, v, s]) => (
          <div key={e} className="rounded-lg border border-neutral-200 px-4! py-3! dark:border-neutral-700">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500">{e}</div>
            <div className="mt-1! font-mono text-[24px] leading-none tabular-nums">{v}</div>
            <div className="mt-1.5! text-[12px] text-neutral-500">{s}</div>
          </div>
        ))}
      </div>

      <div className="mt-5! grid gap-3 md:grid-cols-2">
        {date.reguli.map((r) => (
          <div key={r.nr} className="rounded-lg border border-neutral-200 px-4! py-3! dark:border-neutral-700">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] text-neutral-400">{r.nr}</span>
              <b className="text-[14px]">{r.titlu}</b>
              <span className="ml-auto whitespace-nowrap text-[11px] text-neutral-400">{r.sursa}</span>
            </div>
            <p className="mt-1.5! text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">{r.text}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-6! text-[15px] font-semibold">Naveta pe rute · regula 3</h2>
      <p className="mt-1! max-w-[92ch] text-[12.5px] text-neutral-500">
        Km goi pe zi = drumul dintre locul unde stă mașina și capătul rutei, pe toate schimburile zilei. Doar mașinile care fac ruta acum.
        Lei nu se socotesc: tipul mașinilor SEBN lipsește din tabelul de costuri.
      </p>
      <div className="mt-2! overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.08em] text-neutral-500">
              {['Rută', 'Capăt', 'Mașina', 'Sch.', 'Goi km/zi', '', 'Cu oameni km/zi', 'Goi km/lună'].map((h, i) => (
                <th key={i} className={`border-b border-neutral-200 px-2! py-1.5! font-bold dark:border-neutral-700 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {date.naveta.map((r) => (
              <tr key={r.id} className={`border-b border-neutral-100 dark:border-neutral-800 ${r.gol_zi < 5 ? 'text-neutral-400' : ''}`}>
                <td className="px-2! py-1.5!"><span className="font-mono text-[11px] text-neutral-400">{r.id}</span> {r.nume}</td>
                <td className="px-2! py-1.5!">{r.capat}</td>
                <td className="px-2! py-1.5! font-mono text-[12px]">{r.masini.join(', ')}</td>
                <td className="px-2! py-1.5! text-right font-mono tabular-nums">{r.schimburi}</td>
                <td className="px-2! py-1.5! text-right font-mono font-semibold tabular-nums">{n1(r.gol_zi)}</td>
                <td className="w-[120px] px-2! py-1.5!">
                  <div className="h-1.5 rounded-sm bg-[#B06A1F]" style={{ width: `${(100 * r.gol_zi) / max}%`, opacity: r.gol_zi < 5 ? 0.3 : 0.85 }} />
                </td>
                <td className="px-2! py-1.5! text-right font-mono tabular-nums text-neutral-500">{n1(r.plin_zi)}</td>
                <td className="px-2! py-1.5! text-right font-mono tabular-nums">{n0(r.gol_zi * ZILE_LUNA)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
