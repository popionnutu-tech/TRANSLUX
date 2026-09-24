'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Raport, MasinaRand } from './actions';

// Raportul săptămânal al celor trei reguli (ION-48). Regulile sunt ale lui Ion:
//   1. mașina doarme la uzină, fiecare rută se face de patru ori
//   3. nu pleacă acasă între schimburi — așteaptă la uzină
// Ele se bat pe aceeași mașină și NU se adună: mașina ori doarme la uzină, ori acasă.
//
// Ion, 24.09: «când apăs pe mașină să se deschidă analitica». Rândul se deschide și arată
// aritmetica, fiecare cifră scrisă ca adunare înainte de a fi folosită — «aici nu corect formula
// regula 1», unde lipsea pasul din mijloc. Tot Ion, 24.09 (ION-51): barele zilei scoase («asta din
// raport scoate»), aritmetica pusă pe coloane («aranjare easy going»), antetul refăcut («UX bun»).

const n1 = (x: number | null | undefined) =>
  x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const n2 = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(2).replace('.', ','));
const n0 = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ro-RO'));
const ZI = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' });

// «14–20 septembrie», sau «31 august – 6 septembrie» când săptămâna trece de lună.
function interval(de: string, pana?: string) {
  const a = new Date(`${de}T00:00:00Z`);
  const b = pana ? new Date(`${pana}T00:00:00Z`) : new Date(a.getTime() + 6 * 86400000);
  const luna = (d: Date) => d.toLocaleDateString('ro-RO', { month: 'long', timeZone: 'UTC' });
  return luna(a) === luna(b)
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${luna(b)}`
    : `${a.getUTCDate()} ${luna(a)} – ${b.getUTCDate()} ${luna(b)}`;
}

const cel = (m: MasinaRand) => Math.max(m.r1?.lei ?? -1e9, m.r3?.lei ?? -1e9);

const ROSU = 'text-[#9B1B30] dark:text-[#e0788c]';

// Un pas de calcul pe trei coloane: ce e · cum se socoate · cât iese.
function Pas({ et, calc, rez, tare }: { et: string; calc: React.ReactNode; rez: string; tare?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(110px,150px)_1fr_auto] items-baseline gap-x-4 border-b border-dashed border-neutral-200 py-2 last:border-b-0 dark:border-neutral-700">
      <span className="text-[12.5px] text-neutral-500">{et}</span>
      <span className="font-mono text-[12.5px] tabular-nums text-neutral-600 dark:text-neutral-400">{calc}</span>
      <b className={`whitespace-nowrap text-right font-mono tabular-nums ${tare ? `text-[17px] ${ROSU}` : 'text-[13px] font-semibold text-neutral-900 dark:text-neutral-100'}`}>{rez}</b>
    </div>
  );
}

function Regula({ titlu, ales, children }: { titlu: string; ales: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border bg-white p-4 dark:bg-neutral-900 ${ales ? 'border-[#9B1B30] shadow-[0_0_0_1px_#9B1B30]' : 'border-neutral-200 dark:border-neutral-700'}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{titlu}</span>
        {ales && <span className="rounded bg-[#9B1B30] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#fff' }}>aleasă</span>}
      </div>
      {children}
    </div>
  );
}

function Panou({ m, zileLuna }: { m: MasinaRand; zileLuna: number }) {
  if (m.rutele_de_4 == null) {
    return <div className="p-4 text-sm">Ziua ei nu se poate construi — vezi steagurile de mai sus.</div>;
  }
  const plin = m.rutele_de_4 / 2;
  const lu = m.alte_la_uzina ?? 0, pc = m.alte_la_parc ?? 0, ai = m.alte_aiurea ?? 0;
  const et = m.rute.map((r) => n1(r.etalon)).join(' + ');
  const care = (m.r1?.lei ?? -1e9) >= (m.r3?.lei ?? -1e9) ? 1 : 3;
  const ales = cel(m) > 0;
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Ziua ei, pe o zi de lucru</div>
        <Pas et="Rutele" calc={m.rute.map((r) => `${r.id} ${n1(r.etalon)}`).join(' + ')} rez={`${n1(m.d_uzina)} km`} />
        <Pas et="Cu oameni" calc={`2 × (${et})`} rez={`${n1(plin)} km`} />
        <Pas et="Rutele de 4 ori" calc={`4 × (${et})`} rez={`${n1(m.rutele_de_4)} km`} />
        <Pas et="Alte curse" calc={`${n1(lu)} pe la uzină + ${n1(pc)} la parc + ${n1(ai)} în afara lor`} rez={`${n1(m.alte)} km`} />
        {m.d_casa_pe_capat && (
          <Pas et="De acasă la capăt" calc={m.d_casa_pe_capat.map((x) => `${x.capat} ${n1(x.km)}`).join(' + ')} rez={`${n1(m.d_casa)} km`} />
        )}
        <Pas et="Azi a mers" calc="din urma GPS, media zilelor lucrate" rez={`${n1(m.azi)} km`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {m.r1 && (
          <Regula titlu="Regula 1 · doarme la uzină" ales={ales && care === 1}>
            <Pas et="Ziua nouă" calc={`${n1(m.rutele_de_4)} + ${n1(m.alte)}`} rez={`${n1(m.r1.zi)} km`} />
            <Pas et="Se câștigă" calc={`${n1(m.azi)} − ${n1(m.r1.zi)}`} rez={`${n1(m.r1.km)} km/zi`} />
            <Pas et="Pe lună" calc={`× ${n2(m.lei_km)} lei/km × ${zileLuna} zile`} rez={`${n0(m.r1.lei)} lei`} tare />
          </Regula>
        )}
        {m.r3 && (
          <Regula titlu="Regula 3 · nu pleacă acasă la prânz" ales={ales && care === 3}>
            <Pas et="Ziua nouă" calc={`${n1(plin)} + ${n1(m.d_casa)} + ${n1(m.d_uzina)} + ${n1(m.alte)}`} rez={`${n1(m.r3.zi)} km`} />
            <Pas et="Se câștigă" calc={`${n1(m.azi)} − ${n1(m.r3.zi)}`} rez={`${n1(m.r3.km)} km/zi`} />
            <Pas et="Pe lună" calc={`× ${n2(m.lei_km)} lei/km × ${zileLuna} zile`} rez={`${n0(m.r3.lei)} lei`} tare />
          </Regula>
        )}
      </div>

      {(m.locuri_aiurea ?? []).length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          <div className="px-4 pb-1 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Unde sunt kilometrii din afara uzinei</div>
            <p className="mt-0.5 text-[12px] text-neutral-500">Ieșiri scurte, sub 15 km — de aceea nu apar în lista de deplasări de jos.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-neutral-500">
                  {['Locul', 'km/zi', 'Ore', 'Zile', 'De la uzină', 'Când'].map((h, i) => (
                    <th key={h} className={`px-4 py-1.5 font-semibold ${i > 0 && i < 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(m.locuri_aiurea ?? []).map((x) => (
                  <tr key={x.loc} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-4 py-1.5">{x.loc}</td>
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{n1(x.km_zi)}</td>
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums text-neutral-500">{n1(x.ore)} h</td>
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums text-neutral-500">{x.zile}</td>
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums text-neutral-500">{n1(x.de_la_uzina)} km</td>
                    <td className="px-4 py-1.5 font-mono text-[11.5px] text-neutral-500">
                      {(x.cand ?? []).map((c) => `${String(c.ora).padStart(2, '0')}:00`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {m.km_baza && (
        <p className="text-[12px] text-neutral-500">
          Controlul km: {n1(m.km_baza.km_aici)} km pe {m.zile_masurate} zile aici, {n1(m.km_baza.km)} pe{' '}
          {m.km_baza.zile} în <code className="bg-neutral-200 px-1 dark:bg-neutral-700">lde_vehicle_gps_daily</code> —{' '}
          {m.km_baza.dif > 0 ? '+' : ''}{n1(m.km_baza.dif)}%.
        </p>
      )}
    </div>
  );
}

// Săptămâna se alege prin URL (?saptamina=), ca linkul către o săptămână să se poată trimite.
// Lista vine de la cea mai nouă la cea mai veche: ‹ duce înapoi în timp, › înainte.
function Saptamana({ activa, pana, saptamani }: { activa: string; pana: string; saptamani: string[] }) {
  const router = useRouter();
  const i = saptamani.indexOf(activa);
  const mai_veche = i >= 0 ? saptamani[i + 1] : undefined;
  const mai_noua = i > 0 ? saptamani[i - 1] : undefined;
  const sageata = (s: string | undefined, semn: string, eticheta: string) => s
    ? <Link href={`/lde/reguli?saptamina=${s}`} scroll={false} aria-label={eticheta}
        className="flex h-9 w-9 items-center justify-center text-lg text-neutral-600 hover:bg-[#9B1B30]/[0.06] hover:text-[#9B1B30] dark:text-neutral-300">{semn}</Link>
    : <span className="flex h-9 w-9 items-center justify-center text-lg text-neutral-300 dark:text-neutral-600" aria-hidden>{semn}</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        {sageata(mai_veche, '‹', 'săptămâna dinainte')}
        <span className="min-w-[170px] border-x border-neutral-200 px-3 text-center text-[13.5px] font-semibold leading-9 dark:border-neutral-700">
          {interval(activa, pana)}
        </span>
        {sageata(mai_noua, '›', 'săptămâna următoare')}
      </div>
      {saptamani.length > 1 && (
        <select value={activa} onChange={(e) => router.push(`/lde/reguli?saptamina=${e.target.value}`, { scroll: false })}
          aria-label="Alege săptămâna"
          className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-[12.5px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
          {saptamani.map((s) => <option key={s} value={s}>{interval(s)}</option>)}
        </select>
      )}
    </div>
  );
}

export default function ReguliClient({ raport, saptamani = [] }: {
  raport: Raport | null; saptamani?: string[];
}) {
  const [deschis, setDeschis] = useState<string | null>(null);

  if (!raport) {
    return (
      <div className="p-8">
        <h1 className="mb-2 text-2xl font-bold">Raport livrări</h1>
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
  const r1Mai = (R.total.r1 ?? 0) >= (R.total.r3 ?? 0);

  return (
    <div className="mx-auto max-w-[1160px] p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Raport livrări</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">{R.uzina}</h1>
          <p className="mt-1 text-[12.5px] text-neutral-500">
            Comparat cu scheletul fixat pe {R.schelet_fixat} · rulat{' '}
            {new Date(R.rulat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </div>
        <Saptamana activa={R.saptamina} pana={R.pana_la} saptamani={saptamani.length ? saptamani : [R.saptamina]} />
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { titlu: 'Regula 1 · mașina doarme la uzină', lei: R.total.r1, masini: R.total.masini_r1, mare: r1Mai },
          { titlu: 'Regula 3 · nu pleacă acasă la prânz', lei: R.total.r3, masini: R.total.masini_r3, mare: !r1Mai },
        ].map((k) => (
          <div key={k.titlu} className={`rounded-xl border bg-white p-5 dark:bg-neutral-900 ${k.mare ? 'border-[#9B1B30]/40' : 'border-neutral-200 dark:border-neutral-700'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{k.titlu}</div>
            <div className="mt-2 flex items-baseline gap-2">
              <b className={`font-mono text-[34px] leading-none tabular-nums ${k.mare ? ROSU : 'text-neutral-900 dark:text-neutral-100'}`}>{n0(k.lei)}</b>
              <span className="text-[13px] text-neutral-500">lei pe lună</span>
            </div>
            <div className="mt-2 text-[12.5px] text-neutral-500">{k.masini} mașini câștigă din ea</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-neutral-500">
        Cele două reguli <b className="text-neutral-900 dark:text-neutral-100">nu se adună</b>: mașina ori doarme la uzină,
        ori acasă. Pentru fiecare mașină, coloana «Alege» spune care îi convine.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ['Au lucrat la uzină', `${R.total.masini_uzina} mașini`, 'cel puțin 4 zile la poartă'],
          ['Deplasări peste 15 km', String(R.deplasari.length), 'în afara destinației de lucru'],
          ['Controlul km', ctrl ? `${ctrl.dif > 0 ? '+' : ''}${n1(ctrl.dif)}%` : '—', 'urma GPS față de workerul de noapte; peste 10% = steag'],
        ].map(([et, val, sub]) => (
          <div key={et} className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-neutral-500">{et}</span>
              <b className="font-mono text-[18px] tabular-nums">{val}</b>
            </div>
            <div className="mt-0.5 text-[11.5px] text-neutral-500">{sub}</div>
          </div>
        ))}
      </div>

      <div className="mb-3 mt-9 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Mașină cu mașină</h2>
        <span className="text-[12px] text-neutral-500">apasă un rând ca să vezi calculul</span>
      </div>
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
                <Fragment key={m.masina}>
                  <tr
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
                </Fragment>
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
