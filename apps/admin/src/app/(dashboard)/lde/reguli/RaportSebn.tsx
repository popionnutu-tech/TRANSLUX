import Saptamana from './Saptamana';
import type { LivrareRow } from '@/lib/lde/naveta-image';
import type { IesireLibera, TimpLiberMasina } from './actions';

// Raportul săptămânal de optimizare SEBN (ION-56). Ion, 24.09.2026: «aici raportul e diferit de
// LEAR, fiindcă nu pot sta auto la uzină; aici optimizare km livrare de acasă până începere cursă
// și km brambura, cum în automatizarea noastră săptămânală».
//
// Cifrele NU se socotesc aici: vin din incarcaLivrare(), aceeași funcție care face posterul de
// livrare din Telegram, deci pagina și posterul nu pot spune lucruri diferite. Sursa e
// lde_route_run, scris în fiecare noapte de worker (km_livrare, km_brambura pe fiecare cursă).

export type SaptSebn = {
  luni: string; duminica: string;
  rows: LivrareRow[];
  // timpul liber și brambura după regula LEAR §11 (ION-60), din lde_analiza_reguli «SEBN»
  liber: { masini: { masina: string; poarta: string; casa: string | null; liber: TimpLiberMasina;
      // cursele fără poartă care merg ≥ 80% pe drumul mașinii — socotite muncă (Ion, 25.09)
      pe_ruta_fara_poarta?: { zi: string; de_la: string; pana_la: string; km: number; pe_ruta_pct: number; unde: string | null }[] }[];
    timp_liber: { km_total: number; km_brambura_total?: number } } | null;
  pretMotorina: number; leiImplicit: number;
  alegeri: { luni: string; eticheta: string }[];
};

const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
const n1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
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
const ROSU = 'text-[#9B1B30] dark:text-[#e0788c]';
// titlul unei secțiuni, ca la LEAR (ReguliClient)
const H2 = 'text-xs font-bold uppercase tracking-widest text-neutral-500';

export default function RaportSebn({ s }: { s: SaptSebn }) {
  const lei = (r: LivrareRow) => r.naveta_total * (r.lei_km ?? s.leiImplicit);
  const totLiv = s.rows.reduce((a, r) => a + r.naveta_total, 0);
  const totLei = s.rows.reduce((a, r) => a + lei(r), 0);
  const totLib = s.liber?.timp_liber.km_total ?? 0, totBr = s.liber?.timp_liber.km_brambura_total ?? 0;
  const cuLivrare = s.rows.filter((r) => r.naveta_zi > 0);

  return (
    <section>
      <header className="mb-6! flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Raport livrări</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">SEBN Orhei și Strășeni</h1>
          <p className="mt-1! text-[12.5px] text-neutral-500">
            Luni–vineri, din urma GPS a fiecărei curse · motorină {n2(s.pretMotorina)} lei/l (ANRE)
          </p>
        </div>
        <Saptamana baza="/lde/reguli?uz=sebn&" activa={s.luni} eticheta={eticheta(s.luni, s.duminica)}
          optiuni={s.alegeri.map((a) => ({ v: a.luni, e: a.eticheta }))} />
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { titlu: 'Economie posibilă', val: n0(totLei), unit: 'lei pe săptămână', sub: 'livrare × costul km-ului mașinii', mare: true },
          { titlu: 'Livrare · de acasă la start', val: n0(totLiv), unit: 'km pe săptămână', sub: `${cuLivrare.length} mașini fac drum de acasă până la satul de start`, mare: false },
          { titlu: 'Liber · brambura', val: s.liber ? `${n0(totLib)} · ${n0(totBr)}` : '—', unit: 'km', sub: 'regula LEAR §11 — lanțul muncii', mare: false, rosu: (totLib + totBr) >= 50 },
        ].map((k) => (
          <div key={k.titlu} className={`rounded-[12px] border bg-white p-5! dark:bg-neutral-900 ${k.mare ? 'border-[#9B1B30]/40' : 'border-neutral-200 dark:border-neutral-700'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{k.titlu}</div>
            <div className="mt-2! flex items-baseline gap-2">
              <b className={`font-mono text-[34px] leading-none tabular-nums ${k.mare || k.rosu ? ROSU : 'text-neutral-900 dark:text-neutral-100'}`}>{k.val}</b>
              <span className="text-[13px] text-neutral-500">{k.unit}</span>
            </div>
            <div className="mt-2! text-[12.5px] text-neutral-500">{k.sub}</div>
          </div>
        ))}
      </div>
      <p className="mt-2! max-w-[110ch] text-[12.5px] text-neutral-500">
        La SEBN mașina nu poate sta la uzină, de aceea regula e alta decât la LEAR: se taie <b className="text-neutral-900 dark:text-neutral-100">livrarea</b> —
        km-ii șoferului în afara rutei (casă – satul de start și înapoi), fără service și fără drumuri neobișnuite.
        Economie = livrare × costul km-ului mașinii (norma ei × prețul ANRE al zilei + reparație + salariu).
      </p>

      <div className="mb-3! mt-9! flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={H2}>Mașină cu mașină · livrare (подача)</h2>
        <span className="text-[12px] text-neutral-500">km de acasă până la începerea cursei</span>
      </div>
      {s.rows.length === 0 ? (
        <p className="text-[13.5px] text-neutral-500">Nicio cursă măsurată în săptămâna asta.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse border border-neutral-200 bg-white text-[13px] dark:border-neutral-700 dark:bg-neutral-900">
            <thead>
              <tr className="bg-[#9B1B30]/[0.04]">
                {['Mașina', 'Ruta', 'Cine (locuiește)', 'Zile', 'Total km/zi', 'Plin/zi', 'Goi pe rută', 'Livrare/zi', 'Livrare, km', 'Economie, lei'].map((h, i) => (
                  <th key={h} className={`border-b border-neutral-200 p-2! align-bottom text-[10px] font-semibold uppercase leading-tight tracking-wider text-neutral-500 dark:border-neutral-700 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => {
                const mare = r.naveta_zi >= PRAG_ROSU;
                const [nr, tip] = r.masina.split(' · ');
                const c = 'border-b border-neutral-200 p-2! dark:border-neutral-700';
                const num = `${c} text-right font-mono tabular-nums`;
                return (
                  <tr key={r.masina + r.ruta} className={r.naveta_zi > 0 ? '' : 'opacity-60'}>
                    <th scope="row" className={`${c} whitespace-nowrap text-left`}>
                      <span className="block font-semibold">{nr}</span>
                      <span className="mt-0.5! block text-[11px] font-normal text-neutral-500">{tip ?? '—'}</span>
                    </th>
                    <td className={`${c} text-[12.5px] font-semibold`}>{r.ruta}</td>
                    <td className={`${c} text-[12.5px]`}>{r.sofer}</td>
                    <td className={num}>{r.zile}</td>
                    <td className={num}>{n0(r.total_zi)}</td>
                    <td className={num}>{n0(r.plin_zi)}</td>
                    <td className={`${num} text-neutral-500`}>{n0(r.gol_ruta_zi)}</td>
                    <td className={`${num} font-semibold ${mare ? ROSU : ''}`}>{n0(r.naveta_zi)}</td>
                    <td className={num}>{n0(r.naveta_total)}</td>
                    <td className={`${num} ${mare ? `font-medium ${ROSU}` : ''}`}>{n0(lei(r))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#9B1B30]/[0.04] font-semibold">
                <td className="p-2!" colSpan={8}>Total livrare</td>
                <td className="p-2! text-right font-mono tabular-nums">{n0(totLiv)}</td>
                <td className={`p-2! text-right font-mono tabular-nums ${ROSU}`}>{n0(totLei)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-2! text-[12.5px] text-neutral-500">
        Goi pe rută = întoarcerile goale impuse de ture — ale uzinei, nu se optimizează. Rândurile estompate n-au livrare.
        Roșu = peste {PRAG_ROSU} km livrare pe zi, pragul posterului.
      </p>

      <h2 className={`mb-3! mt-9! ${H2}`}>Mișcări în timpul liber și brambura</h2>
      <p className="max-w-[110ch] text-[12.5px] text-neutral-500">
        Regula de la LEAR (§11): munca e un lanț legat de poarta SEBN în orele schimbului — tot ce e în lanț e muncă, inclusiv livrarea.
        <b> Brambura</b> = km pe un drum pe care mașina n-a mers în nicio altă zi a săptămânii, în cursele lanțului care nu ating poarta.
        <b> Timp liber</b> = cursă fără nicio legătură cu poarta, care nu e reparație (Bălți), altă uzină sau navetă. Steag la 50 km pe săptămână, separat.
      </p>
      {s.liber && (() => {
        // Ion, 25.09: «șoferii brambura trebuie să apară în raport și cu întrebare către Alexei unde ei au umblat»
        const sofer = new Map(s.rows.map((r) => [r.masina.split(' · ')[0], r.sofer]));
        const br = s.liber.masini.flatMap((m) => m.liber.iesiri.filter((x) => x.eticheta === 'brambura' && (x.km_brambura ?? 0) >= 5)
          .map((x) => ({ ...x, masina: m.masina }))).sort((a, b) => a.zi.localeCompare(b.zi) || a.de_la.localeCompare(b.de_la));
        if (!br.length) return null;
        return (
          <div className="mt-4! rounded-[12px] border border-[#9B1B30]/40 bg-white p-5! dark:bg-neutral-900">
            <div className={`text-[11px] font-semibold uppercase tracking-wider ${ROSU}`}>Brambura — Alexei, unde au fost?</div>
            <ul className="mt-2! flex flex-col gap-1.5 text-[13px]">
              {br.map((x, i) => {
                const zi = new Date(`${x.zi}T12:00:00Z`);
                const ziText = `${['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'][zi.getUTCDay()]} ${zi.getUTCDate()}.${String(zi.getUTCMonth() + 1).padStart(2, '0')}`;
                const opriri = x.opriri.filter((o) => o.loc && o.loc !== x.pana_unde).map((o) => `${o.loc} ${o.min}′`).join(', ');
                return (
                  <li key={i}>
                    <b>{ziText}</b> · <b>{x.masina}</b> · {sofer.get(x.masina) ?? 'șofer necunoscut'} · {x.de_la}–{x.pana_la} ·{' '}
                    {x.de_unde === 'acasă' ? 'de acasă' : `de la ${x.de_unde ?? '?'}`} → {x.cel_mai_departe ?? '?'} → {x.pana_unde ?? '?'}
                    {opriri ? ` (opriri: ${opriri})` : ''} · <b className={ROSU}>{n1(x.km_brambura ?? 0)} km</b>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })()}
      {!s.liber ? (
        <p className="mt-3! text-[13.5px] text-neutral-500">Săptămâna asta n-a fost încă analizată (sebn-liber.mjs rulează lunea la 08:00).</p>
      ) : (() => {
        const L = s.liber;
        // ca la LEAR: ieșirile libere/navetă de peste 5 km, brambura de peste 5 km, neclarul de peste 20 km
        const deAratat = (x: IesireLibera) => x.eticheta === 'neclar' ? x.km >= 20 : x.eticheta === 'brambura' ? (x.km_brambura ?? 0) >= 5 : x.km >= 5;
        const cuRanduri = L.masini.filter((m) => m.liber.iesiri.some(deAratat));
        const fara = L.masini.filter((m) => !cuRanduri.includes(m));
        return (
          <div className="mt-4!">
            {!cuRanduri.length && <p className="text-[13px] text-neutral-500">Nicio mașină nu s-a mișcat în afara muncii în săptămâna asta.</p>}
            {cuRanduri.map((m) => {
              const x = m.liber;
              return (
                <div key={m.masina} className="mb-4!">
                  <div className="mb-1! flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <b className="text-[14px]">{m.masina}</b>
                    <span className="text-[12px] text-neutral-500">{m.poarta}{m.casa ? ` · doarme la ${m.casa}` : ''}</span>
                    <span className={`font-mono text-[13px] tabular-nums ${x.peste_prag ? `font-semibold ${ROSU}` : ''}`}>{n1(x.km)} km liber</span>
                    <span className={`font-mono text-[13px] tabular-nums ${x.peste_prag_brambura ? `font-semibold ${ROSU}` : ''}`}>{n1(x.km_brambura ?? 0)} km brambura</span>
                    {(x.peste_prag || x.peste_prag_brambura) && <span className={`text-[10px] font-semibold uppercase tracking-wide ${ROSU}`}>peste 50 km</span>}
                    {x.km_neclar ? <span className="text-[12px] text-neutral-500">neclar {n1(x.km_neclar)} km</span> : null}
                  </div>
                  <ul className="flex flex-col gap-1.5 text-[13px]">
                    {x.iesiri.filter(deAratat).map((y, i) => {
                      const zi = new Date(`${y.zi}T12:00:00Z`);
                      const ziText = `${['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'][zi.getUTCDay()]} ${zi.getUTCDate()}.${String(zi.getUTCMonth() + 1).padStart(2, '0')}`;
                      const opriri = y.opriri.filter((o) => o.loc && o.loc !== y.pana_unde).map((o) => `${o.loc} ${o.min}′`).join(', ');
                      const cand = y.dupa && y.inainte ? `între ${y.dupa} și ${y.inainte}` : y.dupa ? `după ${y.dupa}` : y.inainte ? `înainte de ${y.inainte}` : 'fără niciun drum la poartă în ziua aia';
                      return (
                        <li key={i} className="border-l-[3px] border-neutral-200 pl-3! dark:border-neutral-700">
                          <b>{ziText}</b>, {y.de_la}–{y.pana_la} · <span className="font-mono tabular-nums">{n1(y.km)} km</span>
                          {y.eticheta === 'brambura'
                            ? <span className="text-neutral-500"> · brambura {n1(y.km_brambura ?? 0)} km pe un drum pe care n-a mers în altă zi</span>
                            : y.eticheta !== 'liber' ? <span className="text-neutral-500"> · {y.eticheta}</span> : null}
                          {y.repetat && <span className={ROSU}> · se repetă</span>}
                          <span className="block text-[12.5px] text-neutral-700 dark:text-neutral-300">
                            {y.de_unde === 'acasă' ? 'De acasă' : `De la ${y.de_unde ?? '?'}`} → {y.cel_mai_departe ?? y.loc_principal ?? '?'}{opriri ? ` (opriri: ${opriri})` : ''} → {y.pana_unde ?? '?'} · {cand}
                          </span>
                          {y.nota && <span className="block text-[11.5px] text-neutral-500">{y.nota}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {fara.length > 0 && <p className="text-[12.5px] text-neutral-500">Nimic în afara muncii la {fara.map((m) => m.masina).join(', ')}.</p>}
            {(() => {
              // Ion, 25.09: «asta nu e parte a rutei?» — cursele care merg pe ruta mașinii fără să atingă poarta
              // sunt muncă; se arată aici, ca să se vadă și dacă cineva ar lucra în afara uzinei pe drumul rutei
              const pe = L.masini.flatMap((m) => (m.pe_ruta_fara_poarta ?? []).filter((x) => x.km >= 5).map((x) => ({ ...x, masina: m.masina })));
              if (!pe.length) return null;
              return (
                <div className="mt-6!">
                  <h3 className={H2}>Pe ruta ei, fără poartă — socotit muncă</h3>
                  <p className="text-[12px] text-neutral-500">Cursa merge cel puțin 80% pe drumul mașinii (traseul rutei din schelet și drumul ei de muncă din săptămână), dar nu atinge poarta.</p>
                  <ul className="mt-1! flex flex-col gap-1 text-[12.5px]">
                    {pe.sort((a, b) => a.zi.localeCompare(b.zi) || a.masina.localeCompare(b.masina)).map((x, i) => (
                      <li key={i} className="text-neutral-700 dark:text-neutral-300">
                        <b>{x.masina}</b> · {x.zi.slice(8, 10)}.{x.zi.slice(5, 7)} {x.de_la}–{x.pana_la} · <span className="font-mono tabular-nums">{n1(x.km)} km</span> · {x.pe_ruta_pct}% pe rută{x.unde ? ` · pe la ${x.unde}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        );
      })()}
      <p className="mt-3! text-[13px] text-neutral-500">
        Regulile după care se socotește — într-un singur loc: <a href="/lde/livrare-reguli" className="underline">Livrarea — regula · SEBN</a>, §11.
      </p>
    </section>
  );
}
