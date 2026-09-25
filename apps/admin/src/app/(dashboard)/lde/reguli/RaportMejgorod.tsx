'use client';

import { Fragment, useState } from 'react';
import Saptamana from './Saptamana';
import type { AnalizaMejgorod, RutaOptim } from '@/lib/lde/mejgorod-optimizari-image';

// Raportul săptămânal «cât se putea economisi» pe rutele interurbane nord ↔ Chișinău (ION-65).
// Ion, 25.09.2026: «introdu raportul optimizări livrări săptămânal la interurbane aici».
//
// Cifrele NU se socotesc aici: sunt ale analizei scrise luni de VPS (mejgorod/cod/saptamanal.sh →
// lde_analiza_reguli «MEJGOROD»), aceeași din care se desenează posterul din grupa livrărilor
// (lib/lde/mejgorod-optimizari-image.ts), deci pagina și posterul nu pot spune lucruri diferite.
// Ca pe poster: doar km, fără lei și fără nume de oameni.

// ziua unei mașini pe rută: de unde a pornit dimineața, unde a dormit, ce s-a numărat
type ZiDetaliu = {
  m: string; z: string; pIn: string | null; pOut: string | null;
  optim: number; naveta: number | null; laCapat: boolean; golSeara: number | null;
};
type Ruta = RutaOptim & { zileDetalii?: ZiDetaliu[] };
export type RaportMejgorodDate = AnalizaMejgorod & { rute: Ruta[]; rulat_la: string };

const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
const n1 = (x: number | null | undefined) =>
  x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const ZILE = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
const zi = (d: string) => {
  const t = new Date(`${d}T12:00:00Z`);
  return `${ZILE[t.getUTCDay()]} ${t.getUTCDate()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};
function interval(de: string, pana?: string) {
  const a = new Date(`${de}T00:00:00Z`);
  const b = pana ? new Date(`${pana}T00:00:00Z`) : new Date(a.getTime() + 6 * 86400000);
  const luna = (d: Date) => d.toLocaleDateString('ro-RO', { month: 'long', timeZone: 'UTC' });
  return luna(a) === luna(b)
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${luna(b)}`
    : `${a.getUTCDate()} ${luna(a)} – ${b.getUTCDate()} ${luna(b)}`;
}
const VERDE = 'text-[#1f7a4d] dark:text-[#6fd3a0]';
const URL_UZ = '/lde/reguli?uz=mejgorod';

function Zile({ r }: { r: Ruta }) {
  const d = r.zileDetalii ?? [];
  if (!d.length) return <p className="text-[12.5px] text-neutral-500">Analiza săptămânii n-are zilele scrise.</p>;
  return (
    <table className="w-full border-collapse text-[12.5px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-[0.08em] text-neutral-500">
          {['Ziua', 'Mașina', 'Dimineața din', 'Doarme la', 'Seara la capăt', 'Navetă', 'Gol seara', 'Optimizabil'].map((h, i) => (
            <th key={h} className={`px-2! py-1! font-bold ${i >= 5 ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {d.map((x) => {
          // seara nu la capăt, dar dimineața navetă = caz B: ca și cum ar fi rămas la capăt
          const cazB = !x.laCapat && (x.naveta ?? 0) > 0.5;
          return (
            <tr key={x.m + x.z} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="px-2! py-1! whitespace-nowrap">{zi(x.z)}</td>
              <td className="px-2! py-1! whitespace-nowrap font-mono">{x.m}</td>
              <td className="px-2! py-1!">{x.pIn ?? '—'}</td>
              <td className="px-2! py-1!">{x.pOut ?? '—'}</td>
              <td className="px-2! py-1!">
                {x.laCapat ? 'da' : <span className="text-neutral-500">nu{cazB ? ' · caz B' : ''}</span>}
              </td>
              <td className="px-2! py-1! text-right font-mono tabular-nums">{n1(x.naveta)}</td>
              <td className="px-2! py-1! text-right font-mono tabular-nums">{n1(x.golSeara)}</td>
              <td className={`px-2! py-1! text-right font-mono tabular-nums ${x.optim >= 0.5 ? `font-semibold ${VERDE}` : 'text-neutral-400'}`}>
                {x.optim >= 0.5 ? `−${n1(x.optim)}` : '0'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function RaportMejgorod({ a, saptamani }: { a: RaportMejgorodDate | null; saptamani: string[] }) {
  const [deschis, setDeschis] = useState<number | null>(null);

  if (!a) {
    return (
      <div className="p-8!">
        <h1 className="mb-2! text-2xl font-bold">Rute interurbane</h1>
        <p className="text-neutral-500">
          Nu există încă nicio analiză în <code>lde_analiza_reguli</code> (uzina «MEJGOROD»). O scrie luni
          dimineața <code>mejgorod/cod/saptamanal.sh</code> de pe VPS.
        </p>
      </div>
    );
  }

  // aceleași socoteli ca posterul: doar rutele cu zile, ordonate după km optimizabili
  const rute = a.rute.filter((r) => r.zile > 0).sort((x, y) => y.optimTotal - x.optimTotal);
  const cuOptim = rute.filter((r) => r.optimTotal >= 5);
  const tot = rute.reduce((s, r) => s + r.optimTotal, 0);
  const zile = rute.reduce((s, r) => s + r.zile, 0);
  const laCapat = rute.reduce((s, r) => s + r.searaLaCapat, 0);
  const cazB = rute.reduce((s, r) => s + r.cazB, 0);
  const douaM = a.rute.filter((r) => (r.douaMasini ?? 0) > 0);
  const azi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Chisinau' });
  const inCurs = a.pana_la >= azi;

  return (
    <div className="mx-auto! max-w-[1160px] p-4! sm:p-6!">
      <header className="mb-6! flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Raport livrări</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Rute interurbane nord – Chișinău</h1>
          <p className="mt-1! text-[12.5px] text-neutral-500">
            Pe scheletul rutei (un drum, tur = retur) · rulat{' '}
            {new Date(a.rulat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Chisinau' })}
            {inCurs && <b className="text-[#9B1B30] dark:text-[#e0788c]"> · săptămâna în curs, cifrele nu-s finale</b>}
          </p>
        </div>
        <Saptamana baza={`${URL_UZ}&`} activa={a.saptamina} eticheta={interval(a.saptamina, a.pana_la)}
          optiuni={(saptamani.length ? saptamani : [a.saptamina]).map((s) => ({ v: s, e: interval(s) }))} />
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { titlu: 'Optimizabil · ar fi rămas la capăt', val: `−${n0(tot)}`, unit: 'km pe săptămână', sub: `≈ −${n0((tot * 52) / 12)} km pe lună, pe ${cuOptim.length} rute`, mare: true },
          { titlu: 'Seara la capăt', val: `${zile ? Math.round((100 * laCapat) / zile) : 0} %`, unit: 'din zile', sub: `${laCapat} din ${zile} zile — doar ele intră în socoteală`, mare: false },
          { titlu: 'Caz B · navetă dimineața, seara nu', val: n0(cazB), unit: 'zile', sub: 'seara s-a oprit pe rută: ca și cum ar fi rămas la capăt, zero', mare: false },
        ].map((k) => (
          <div key={k.titlu} className={`rounded-[12px] border bg-white p-5! dark:bg-neutral-900 ${k.mare ? 'border-[#1f7a4d]/40' : 'border-neutral-200 dark:border-neutral-700'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{k.titlu}</div>
            <div className="mt-2! flex items-baseline gap-2">
              <b className={`font-mono text-[34px] leading-none tabular-nums ${k.mare ? VERDE : 'text-neutral-900 dark:text-neutral-100'}`}>{k.val}</b>
              <span className="text-[13px] text-neutral-500">{k.unit}</span>
            </div>
            <div className="mt-2! text-[12.5px] text-neutral-500">{k.sub}</div>
          </div>
        ))}
      </div>
      <p className="mt-2! max-w-[110ch] text-[12.5px] text-neutral-500">
        Optimizabil = golul de seară de la capăt până acasă plus naveta de dimineață înapoi, numărat doar în zilele în care
        seara ultimul drum a ajuns la capăt și dimineața mașina a venit de acasă. Unde doarme mașina vine din GPS (ultimul
        punct înainte de ora 03), cu numele localității; în aceeași localitate cu capătul nu e navetă.
      </p>

      <div className="mb-3! mt-9! flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Rută cu rută</h2>
        <span className="text-[12px] text-neutral-500">apasă un rând ca să vezi zilele</span>
      </div>
      <div className="overflow-x-auto rounded-[12px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <table className="w-full min-w-[920px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#9B1B30]/[0.04] text-[10px] uppercase tracking-[0.08em] text-neutral-500">
              {['Ruta', 'Capătul', 'Doarme la', 'Seara la capăt', 'Navetă/zi', 'Gol seara/zi', 'Optimizabil', 'Caz B', 'Mașina'].map((h, i) => (
                <th key={h} className={`px-3! py-2.5! font-bold ${i >= 3 && i <= 7 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rute.map((r) => {
              const des = deschis === r.ruta;
              const mare = r.optimZi >= 10;
              const sub = [
                r.doarmeNopti != null && r.doarmeNopti < r.zile ? `${r.doarmeNopti} din ${r.zile} nopți` : null,
                r.ordine === 'retur→tur' ? 'retur dimineața, tur seara' : null,
              ].filter(Boolean).join(' · ');
              return (
                <Fragment key={r.ruta}>
                  <tr onClick={() => setDeschis(des ? null : r.ruta)} aria-expanded={des}
                    className={`cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50 ${r.optimTotal < 5 ? 'text-neutral-500' : ''}`}>
                    <td className="px-3! py-2! font-semibold">{r.ruta}</td>
                    <td className="px-3! py-2!">
                      {r.capNord}
                      <span className="block max-w-[260px] truncate text-[11px] text-neutral-500" title={r.nume}>{r.nume}</span>
                    </td>
                    <td className="px-3! py-2!">
                      {r.doarme ?? '—'}
                      {sub && <span className="block text-[11px] text-neutral-500">{sub}</span>}
                    </td>
                    <td className="px-3! py-2! text-right font-mono tabular-nums">{r.searaLaCapat}/{r.zile}</td>
                    <td className="px-3! py-2! text-right font-mono tabular-nums">{n1(r.navetaMed)}</td>
                    <td className="px-3! py-2! text-right font-mono tabular-nums">{n1(r.golSearaMed)}</td>
                    <td className={`px-3! py-2! text-right font-mono tabular-nums ${r.optimTotal >= 0.5 ? VERDE : ''} ${mare ? 'font-bold' : ''}`}>
                      {r.optimTotal >= 0.5 ? `−${n0(r.optimTotal)}` : '0'}
                      <span className="block text-[11px] font-normal text-neutral-500">{n1(r.optimZi)} km/zi</span>
                    </td>
                    <td className="px-3! py-2! text-right font-mono tabular-nums text-neutral-500">{r.cazB}</td>
                    <td className="px-3! py-2! font-mono text-[12px] text-neutral-500">{r.masini.join(', ')}</td>
                  </tr>
                  {des && (
                    <tr className="bg-neutral-50/70 dark:bg-neutral-800/30">
                      <td colSpan={9} className="px-4! py-3!">
                        {(r.douaMasini ?? 0) > 0 && (
                          <p className="mb-2! text-[12.5px] text-neutral-500">
                            În {r.douaMasini} {r.douaMasini === 1 ? 'zi' : 'zile'} turul și returul le-au făcut mașini diferite — acolo golul de seară e al altei mașini și nu se numără.
                          </p>
                        )}
                        <Zile r={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 font-semibold dark:border-neutral-700">
              <td className="px-3! py-2.5!" colSpan={6}>Pe {cuOptim.length} rute cu km optimizabili</td>
              <td className={`px-3! py-2.5! text-right font-mono tabular-nums ${VERDE}`}>−{n0(tot)}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums text-neutral-500">{cazB}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {douaM.length > 0 && (
        <p className="mt-2! text-[12.5px] text-neutral-500">
          Nu se numără {douaM.length === 1 ? 'ruta' : 'rutele'} {douaM.map((r) => r.ruta).join(', ')} în zilele în care turul și
          returul le fac mașini diferite: golul de seară e al altei mașini.
        </p>
      )}
      <p className="mt-2! text-[12.5px] text-neutral-500">
        Naveta și golul sunt mediane pe săptămână. Rândurile gri n-au km optimizabili: dorm la capăt, sunt «caz B» sau fac
        returul dimineața și dorm la Chișinău. Același raport pleacă luni la 08:00 ca poster în grupa livrărilor de uzină.
      </p>
    </div>
  );
}
