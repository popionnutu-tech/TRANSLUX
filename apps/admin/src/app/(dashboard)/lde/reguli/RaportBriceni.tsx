'use client';

import { Fragment, useState } from 'react';
import Saptamana from './Saptamana';
import type { AnalizaBriceni, MasinaBriceni, Categorie, RutaFacuta } from '@/lib/lde/briceni-optimizari-image';

// Raportul săptămânal de livrare la Trox + suburbanele Briceni (ION-73). Ion, 25.09.2026: «aplică regulile
// optimizare SEBN la Trox și suburbane». Aceleași mașini fac și Trox, și suburbanul, deci ziua mașinii e împărțită
// întreagă pe categorii (tabela de precedență din briceni/cod/livrare.mjs). Cifrele NU se socotesc aici: sunt ale
// analizei scrise luni de VPS (lde_analiza_reguli «BRICENI»), aceeași din care se desenează posterul.
// Pe pagină (doar ADMIN) apar și casa mașinii, orele și motivul fiecărei bucăți; pe poster nu.

export type RaportBriceniDate = AnalizaBriceni & { rulat_la: string };

const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
const n1 = (x: number | null | undefined) => (x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ','));
const ZILE = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
const zi = (d: string) => { const t = new Date(`${d}T12:00:00Z`); return `${ZILE[t.getUTCDay()]} ${t.getUTCDate()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
function interval(de: string, pana?: string) {
  const a = new Date(`${de}T00:00:00Z`);
  const b = pana ? new Date(`${pana}T00:00:00Z`) : new Date(a.getTime() + 6 * 86400000);
  const luna = (d: Date) => d.toLocaleDateString('ro-RO', { month: 'long', timeZone: 'UTC' });
  return luna(a) === luna(b) ? `${a.getUTCDate()}–${b.getUTCDate()} ${luna(b)}` : `${a.getUTCDate()} ${luna(a)} – ${b.getUTCDate()} ${luna(b)}`;
}
const VERDE = 'text-[#1f7a4d] dark:text-[#6fd3a0]';
const URL_UZ = '/lde/reguli?uz=briceni';
export const NUME_CAT: Record<Categorie, string> = {
  cuOameni: 'cu oameni', nepotrivita: 'cursă în afara orarului', golRuta: 'gol pe rută', golTure: 'gol între ture (Trox)', service: 'service',
  deplasare: 'deplasare', livrare: 'livrare', legatura: 'legătură Trox ↔ suburban', necunoscut: 'necunoscut',
};
// Gol între ture (Trox). Ion, 25.09: «mașina are același capăt, face pentru același capăt 6 drumuri, 2 ture» — drumurile
// goale spre capăt între ture sunt impuse de ture, nu livrare. Săptămânile scrise înainte de categoria asta n-o au.
const gt = (k: Partial<Record<Categorie, number>>) => k.golTure ?? 0;
const CULOARE_CAT: Partial<Record<Categorie, string>> = { livrare: VERDE, necunoscut: 'text-[#9B1B30] dark:text-[#e0788c]' };

// Ce rute a făcut mașina (Ion, 26.09: «nu îmi ajunge informație, care rute face»): Trox (T1–T6) și suburbanele, cu câte
// curse cu oameni; pe săptămână și câte zile. Săptămânile scrise înainte de 26.09 nu au câmpul.
function Rute({ rute, zi = false }: { rute?: RutaFacuta[]; zi?: boolean }) {
  if (!rute?.length) return <span className="text-neutral-400">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {rute.map((r) => (
        <span key={r.r} title={`${r.trox ? 'Trox' : 'suburban'} ${r.r}: ${r.curse} curse cu oameni, ${n1(r.km)} km${r.zile ? `, în ${r.zile} zile` : ''}`}
          className={`whitespace-nowrap rounded-[6px] border px-1.5! font-mono text-[11.5px] ${r.trox
            ? 'border-[#9B1B30]/40 text-[#9B1B30] dark:text-[#e0788c]' : 'border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300'}`}>
          {r.trox ? 'Trox ' : ''}{r.r} <span className="text-neutral-500">{zi || !r.zile ? `×${r.curse}` : `${r.zile} z`}</span>
        </span>
      ))}
    </span>
  );
}

function Zile({ m }: { m: MasinaBriceni }) {
  return (
    <div className="space-y-3!">
      {m.detalii.map((d) => (
        <div key={d.z}>
          <div className="mb-1! flex flex-wrap gap-x-4 text-[12.5px]">
            <b>{zi(d.z)}</b>
            <Rute rute={d.rute} zi />
            <span className="text-neutral-500">{n1(d.total)} km în zi · noaptea la {d.casaDim ?? '—'} → {d.casaSeara ?? '—'}</span>
            <span className={VERDE}>livrare {n1(d.km.livrare)} km{d.lei != null ? ` · ${n0(d.lei)} lei` : ''}</span>
            {!d.bilant && <span className="text-[#9B1B30]">bilanț cu {n1(d.dif)} km diferență</span>}
          </div>
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {d.bucati.map((b, i) => (
                <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="w-[110px] px-2! py-0.5! whitespace-nowrap font-mono text-neutral-500">{b.ora}</td>
                  <td className={`w-[190px] px-2! py-0.5! ${CULOARE_CAT[b.cat] ?? ''}`}>{NUME_CAT[b.cat]}</td>
                  <td className="w-[70px] px-2! py-0.5! text-right font-mono tabular-nums">{n1(b.km)}</td>
                  <td className="w-[80px] px-2! py-0.5! font-mono text-neutral-500">{b.r ?? ''}</td>
                  <td className="px-2! py-0.5! text-neutral-500">
                    {b.motiv ?? ''}{b.golTure ? ` · plus ${n1(b.golTure)} km gol între ture (pe traseul rutei), nu livrare` : ''}
                    {b.brambura ? ` · brambura ${n1(b.brambura)} km (drum nefolosit în alte zile), scăzută` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export default function RaportBriceni({ a, saptamani }: { a: RaportBriceniDate | null; saptamani: string[] }) {
  const [deschis, setDeschis] = useState<string | null>(null);
  if (!a) {
    return (
      <div className="p-8!">
        <h1 className="mb-2! text-2xl font-bold">Trox + suburban Briceni</h1>
        <p className="text-neutral-500">
          Nu există încă nicio analiză în <code>lde_analiza_reguli</code> (uzina «BRICENI»). O scrie luni dimineața{' '}
          <code>briceni/cod/saptamanal.sh</code> de pe VPS.
        </p>
      </div>
    );
  }
  const t = a.total;
  const masini = [...a.masini].sort((x, y) => y.km.livrare - x.km.livrare);
  const azi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Chisinau' });
  const inCurs = a.pana_la >= azi;
  const cols = ['Mașina', 'Zile', 'Noaptea la', 'Rute făcute', 'Cu oameni', 'Gol pe rută + ture', 'Legătură', 'Livrare/zi', 'Livrare', 'Lei', 'Brambura'];

  return (
    <div className="mx-auto! max-w-[1160px] p-4! sm:p-6!">
      <header className="mb-6! flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Raport livrări · regulile SEBN</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Trox + rute suburbane Briceni</h1>
          <p className="mt-1! text-[12.5px] text-neutral-500">
            Din GPS, ziua întreagă a fiecărei mașini · rulat{' '}
            {new Date(a.rulat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Chisinau' })}
            {' '}· bilanțul km iese pe {a.zileBilantOk} din {a.zile} zile
            {inCurs && <b className="text-[#9B1B30] dark:text-[#e0788c]"> · săptămâna în curs, cifrele nu-s finale</b>}
          </p>
        </div>
        <Saptamana baza={`${URL_UZ}&`} activa={a.saptamina} eticheta={interval(a.saptamina, a.pana_la)}
          optiuni={(saptamani.length ? saptamani : [a.saptamina]).map((s) => ({ v: s, e: interval(s) }))} />
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { titlu: 'Economie posibilă · livrare', val: n0(t.livrare), unit: 'km', sub: `≈ ${n0(t.lei)} lei pe săptămână`, mare: true },
          { titlu: 'Cu oameni', val: n0(t.cuOameni + t.nepotrivita), unit: 'km', sub: `din care ${n0(t.nepotrivita)} în curse din afara orarului`, mare: false },
          { titlu: 'Gol pe rută, între ture, legătură', val: n0(t.golRuta + gt(t) + t.legatura), unit: 'km', sub: `impuse de orar, de ture și de cele două joburi — nu se optimizează; ${n0(gt(t))} km între ture Trox (6 drumuri pe 2 ture, același capăt)`, mare: false },
          { titlu: 'Brambura', val: n0(t.brambura), unit: 'km', sub: 'drum pe care mașina n-a mai mers în altă zi (SEBN §11.3), scăzut din livrare', mare: false },
        ].map((k) => (
          <div key={k.titlu} className={`rounded-[12px] border bg-white p-5! dark:bg-neutral-900 ${k.mare ? 'border-[#1f7a4d]/40' : 'border-neutral-200 dark:border-neutral-700'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{k.titlu}</div>
            <div className="mt-2! flex items-baseline gap-2">
              <b className={`font-mono text-[30px] leading-none tabular-nums ${k.mare ? VERDE : 'text-neutral-900 dark:text-neutral-100'}`}>{k.val}</b>
              <span className="text-[13px] text-neutral-500">{k.unit}</span>
            </div>
            <div className="mt-2! text-[12.5px] text-neutral-500">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="mb-3! mt-9! flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Mașină cu mașină</h2>
        <span className="text-[12px] text-neutral-500">apasă un rând ca să vezi zilele, bucată cu bucată</span>
      </div>
      <div className="overflow-x-auto rounded-[12px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <table className="w-full min-w-[1180px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#9B1B30]/[0.04] text-[10px] uppercase tracking-[0.08em] text-neutral-500">
              {cols.map((h, i) => <th key={h} className={`px-3! py-2.5! font-bold ${i >= 4 || i === 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {masini.map((m) => {
              const des = deschis === m.m;
              return (
                <Fragment key={m.m}>
                  <tr onClick={() => setDeschis(des ? null : m.m)} aria-expanded={des}
                    className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50">
                    <td className="px-3! py-2! font-mono font-semibold">{m.m}</td>
                    <td className="px-3! py-2! text-right font-mono tabular-nums">{m.zile}</td>
                    <td className="px-3! py-2!">{m.casa ?? '—'}</td>
                    <td className="px-3! py-2!"><Rute rute={m.rute} /></td>
                    <td className="px-3! py-2! text-right font-mono tabular-nums">{n0(m.km.cuOameni + m.km.nepotrivita)}</td>
                    <td className="px-3! py-2! text-right font-mono tabular-nums">{n0(m.km.golRuta + gt(m.km))}</td>
                    <td className="px-3! py-2! text-right font-mono tabular-nums">{n0(m.km.legatura)}</td>
                    <td className={`px-3! py-2! text-right font-mono tabular-nums ${m.livrareZi > 40 ? `font-bold ${VERDE}` : ''}`}>{n1(m.livrareZi)}</td>
                    <td className={`px-3! py-2! text-right font-mono tabular-nums ${VERDE}`}>{n0(m.km.livrare)}</td>
                    <td className="px-3! py-2! text-right font-mono tabular-nums">{m.lei == null ? '—' : n0(m.lei)}</td>
                    <td className={`px-3! py-2! text-right font-mono tabular-nums ${m.steagBrambura ? 'font-bold text-[#9B1B30]' : 'text-neutral-500'}`}>{n0(m.brambura)}</td>
                  </tr>
                  {des && (
                    <tr className="bg-neutral-50/70 dark:bg-neutral-800/30">
                      <td colSpan={cols.length} className="px-4! py-3!"><Zile m={m} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 font-semibold dark:border-neutral-700">
              <td className="px-3! py-2.5!" colSpan={4}>Pe {masini.length} mașini</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n0(t.cuOameni + t.nepotrivita)}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n0(t.golRuta + gt(t))}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n0(t.legatura)}</td>
              <td />
              <td className={`px-3! py-2.5! text-right font-mono tabular-nums ${VERDE}`}>{n0(t.livrare)}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n0(t.lei)}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n0(t.brambura)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h2 className="mb-3! mt-9! text-xs font-bold uppercase tracking-widest text-neutral-500">Livrarea pe rute</h2>
      <div className="overflow-x-auto rounded-[12px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#9B1B30]/[0.04] text-[10px] uppercase tracking-[0.08em] text-neutral-500">
              {['Ruta', 'Livrare', 'Lei', 'Mașinile de pe urmă'].map((h, i) => <th key={h} className={`px-3! py-2.5! font-bold ${i === 1 || i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {a.rute.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-3! py-2!"><b className="font-mono">{r.id}</b> <span className="text-neutral-500">{r.nume}</span></td>
                <td className={`px-3! py-2! text-right font-mono tabular-nums ${r.livrare >= 0.5 ? VERDE : 'text-neutral-400'}`}>{n0(r.livrare)}</td>
                <td className="px-3! py-2! text-right font-mono tabular-nums">{n0(r.lei)}</td>
                <td className="px-3! py-2! font-mono text-[12px] text-neutral-500">{r.masini.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6! space-y-1.5! text-[12.5px] text-neutral-500">
        <p>
          Categoriile, în ordine: cursele Trox (capăt ↔ poartă, inclusiv returul după predarea pe loc) și cursele suburbane din orar
          sunt <b>cu oameni</b>, și returul spre capăt după ultima cursă a rutei (orarele suburbane au doar tururi); întoarcerea goală
          gară → sat între două curse ale aceleiași rute e <b>gol pe rută</b>; drumul de acasă până la prima cursă și seara înapoi e{' '}
          <b>livrare</b> — singura economie (șofer din satul de start sau mașina așteaptă la capăt). Pe acasă între două curse, livrare e
          doar <b>ocolul</b>: km-ii peste drumul direct de la sfârșitul unei curse la începutul următoarei (km pe drum), pe care mașina
          l-ar face oricum — între două ture Trox acel drum direct e <b>gol între ture</b> (pe traseul rutei: 6 drumuri pe 2 ture, același
          capăt), altfel <b>legătură</b>; niciunul nu e economie. Un drum gol cu urcări (30 s – 5 min) în ≥2 sate ale rutei, care pleacă de
          la gară sau ajunge la gară ori poartă, e <b>cursă în afara orarului</b>.
        </p>
        <p>Lei = livrare × (norma mașinii × prețul ANRE al zilei + 1,00 reparație, 1,50 la autobuz mare + 1,00 salariu).</p>
        <p>
          Flota vine din GPS, nu din lista de atribuiri: lista Trox din bază (073BRAO, 480BRAS, 281BRAT) nu e cine duce rutele.
          Suburbanul: rutele atribuite în grafic, plus orice cursă a unei rute neatribuite care se potrivește cu orarul ei (mașina de
          Trox care face și curse suburbane între ture).
          {a.faraTracker.length > 0 && <> Fără tracker, deci fără analiză: {a.faraTracker.join(', ')}.</>}
          {a.zileInterurban.length > 0 && <> {a.zileInterurban.length} zile-mașină cu cursă interurbană (Chișinău ↔ nord) sunt scoase: țin de raportul rutelor interurbane.</>}
        </p>
      </div>
    </div>
  );
}
