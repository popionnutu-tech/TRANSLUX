'use client';

import { Fragment, useState } from 'react';
import Saptamana from './Saptamana';
import { CAT_DRAX, PRAG_INDICATII_KM, type AnalizaDrax, type CategorieDrax, type MasinaDrax } from '@/lib/lde/drax-analiza';

// Raportul săptămânal Drăxlmaier Bălți (ION-94, faza 3 din ION-86). Cifrele NU se socotesc aici: sunt ale rândului «DRAXELMAIER»
// scris luni de VPS (drax/cod/saptamanal), același din care se desenează posterul. Componentă PROPRIE (nu RaportBriceni): la
// Drăxlmaier golul între ture = drumul dintre tur și retur, parcul e loc de așteptare lângă uzină, iar economia e regula B
// (R1a + R1b + R3, «cost de azi», §8.1), extrapolată pe zilele lucrate (§10.3). Timpul liber și brambura (§11) se caută doar în km
// pe care categoriile §5 nu i-au explicat («un km, un singur loc», §11.2). Pe pagină (doar ADMIN) apar casa, orele și motivele.

export type RaportDraxDate = AnalizaDrax & { rulat_la: string };

const n0 = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ro-RO'));
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
const ROSU = 'text-[#9B1B30] dark:text-[#e0788c]';
const URL_UZ = '/lde/reguli?uz=drax';
const linie = (lin: string | null | undefined) => (lin ? lin.split('|').join(' · ') : '');
export const NUME_CAT_DRAX: Record<CategorieDrax, string> = {
  cuOameni: 'cu oameni', livrare: 'livrare (casă – rută)', golRuta: 'gol pe rută', golTure: 'gol între tur și retur', parc: 'parc (lângă uzină)',
  service: 'service', deplasare: 'deplasare', legatura: 'legătură între linii', necunoscut: 'necunoscut',
};
const CULOARE_CAT: Partial<Record<CategorieDrax, string>> = { livrare: VERDE, necunoscut: ROSU };

function Card({ titlu, val, sub, mare }: { titlu: string; val: string; sub: string; mare?: boolean }) {
  return (
    <div className={`rounded-[12px] border bg-white p-5! dark:bg-neutral-900 ${mare ? 'border-[#1f7a4d]/40' : 'border-neutral-200 dark:border-neutral-700'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{titlu}</div>
      <div className="mt-2! flex items-baseline gap-2">
        <b className={`font-mono text-[30px] leading-none tabular-nums ${mare ? VERDE : 'text-neutral-900 dark:text-neutral-100'}`}>{val}</b>
        <span className="text-[13px] text-neutral-500">km</span>
      </div>
      <div className="mt-2! text-[12.5px] text-neutral-500">{sub}</div>
    </div>
  );
}

function Zile({ m }: { m: MasinaDrax }) {
  return (
    <div className="space-y-3!">
      {m.deLamurit && <p className={`text-[12.5px] ${ROSU}`}>De lămurit — posibilă cursă a firmei: {m.deLamurit}</p>}
      {m.detalii.map((d) => (
        <div key={d.z}>
          <div className="mb-1! flex flex-wrap gap-x-4 text-[12.5px]">
            <b>{zi(d.z)}</b>
            <span className="text-neutral-500">{n1(d.total)} km în zi · noaptea la {d.noapteDim ?? '—'} → {d.noapteSeara ?? '—'}</span>
            {d.economie && <span className={VERDE}>B {n1(d.economie.B)} km (R1a {n1(d.economie.R1a)} · R1b {n1(d.economie.R1b)} · R3 {n1(d.economie.R3)})</span>}
            {d.economie && d.economie.nelamurit > 0 && <span className="text-neutral-500">nelămurit {n1(d.economie.nelamurit)} km</span>}
            {d.exclus && <span className="text-neutral-500">nu intră în sumele §8: {d.exclus}</span>}
            {d.brambura > 0 && <span className={ROSU}>brambura {n1(d.brambura)} km</span>}
            {!d.bilant && <span className={ROSU}>bilanț cu {n1(d.dif)} km diferență</span>}
          </div>
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {d.bucati.map((b, i) => (
                <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="w-[110px] px-2! py-0.5! whitespace-nowrap font-mono text-neutral-500">{b.ora}</td>
                  <td className={`w-[190px] px-2! py-0.5! ${CULOARE_CAT[b.cat] ?? ''}`}>
                    {NUME_CAT_DRAX[b.cat] ?? b.cat}{b.ocol ? ' · ocol' : ''}{b.pranz ? ' · cursă de prânz' : ''}
                  </td>
                  <td className="w-[70px] px-2! py-0.5! text-right font-mono tabular-nums">{n1(b.km)}</td>
                  <td className="w-[300px] px-2! py-0.5!">{b.de || b.pana ? <span className="font-medium">{b.de ?? '?'} → {b.pana ?? '?'}</span> : null}</td>
                  <td className="w-[200px] px-2! py-0.5! text-neutral-500">{linie(b.lin)}</td>
                  <td className="px-2! py-0.5! text-neutral-500">
                    {b.motiv ?? ''}
                    {b.cat === 'golTure' && b.r3 != null ? ` · R3 ${n1(b.r3)} km (din afara zonei), în zona uzinei ${n1(b.inZona)} km` : ''}
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

function Liste({ a }: { a: RaportDraxDate }) {
  const nel = a.masini.flatMap((m) => m.nelamuritLista.filter((q) => !q.exclus).map((q) => ({ m: m.m, ...q })));
  const pranz = a.masini.flatMap((m) => m.curseDePranz.lista.map((q) => ({ m: m.m, ...q })));
  const rand = (x: { m: string; zi?: string; ora: string; km: number; lin: string | null }, i: number) => (
    <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
      <td className="px-3! py-1.5! font-mono font-semibold">{x.m}</td>
      <td className="px-3! py-1.5!">{x.zi ? zi(x.zi) : '—'}</td>
      <td className="px-3! py-1.5! font-mono text-neutral-500">{x.ora}</td>
      <td className="px-3! py-1.5! text-right font-mono tabular-nums">{n1(x.km)}</td>
      <td className="px-3! py-1.5! text-neutral-500">{linie(x.lin)}</td>
    </tr>
  );
  const tabel = (titlu: string, sub: string, L: typeof nel) => (
    <div>
      <h2 className="mb-1! mt-9! text-xs font-bold uppercase tracking-widest text-neutral-500">{titlu} · {L.length} · {n1(L.reduce((s, x) => s + x.km, 0))} km</h2>
      <p className="mb-2! text-[12.5px] text-neutral-500">{sub}</p>
      {L.length > 0 && (
        <div className="overflow-x-auto rounded-[12px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          <table className="w-full min-w-[640px] border-collapse text-[13px]"><tbody>{L.map(rand)}</tbody></table>
        </div>
      )}
    </div>
  );
  return (
    <>
      {tabel('Nelămurit în intervalul perechii', 'Km din afara zonei uzinei între tur și retur care nu se pot pune nici la R3, nici la §11 (§8.3): o listă separată, nici economie, nici timp liber.', nel)}
      {tabel('Curse de prânz', 'Curse fără schimb între 08:00 și 15:00 — muncă (gol pe rută sau cu oameni), nu brambura.', pranz)}
    </>
  );
}

export default function RaportDrax({ a, saptamani }: { a: RaportDraxDate | null; saptamani: string[] }) {
  const [deschis, setDeschis] = useState<string | null>(null);
  if (!a) {
    return (
      <div className="p-8!">
        <h1 className="mb-2! text-2xl font-bold">Drăxlmaier Bălți</h1>
        <p className="text-neutral-500">
          Nu există încă nicio analiză în <code>lde_analiza_reguli</code> (uzina «DRAXELMAIER»). O scrie luni dimineața{' '}
          <code>drax/cod/saptamanal/saptamanal.sh</code> de pe VPS, doar pentru o săptămână încheiată și doar cu proba P10 trecută.
        </p>
      </div>
    );
  }
  const c = a.economie.carduri;
  const t = a.total;
  const TL = a.timp_liber;
  const masini = [...a.masini].sort((x, y) => (y.extrapolat.B ?? -1) - (x.extrapolat.B ?? -1));
  const azi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Chisinau' });
  const inCurs = a.pana_la >= azi;
  const cols = ['Mașina', 'Linii', 'Zile', 'Noaptea la', 'R1a', 'R1b', 'R3', 'B', 'Liber', 'Brambura'];
  const P10 = a.control.P10;
  const probe = Object.entries(a.control.probe ?? {});

  return (
    <div className="mx-auto! max-w-[1160px] p-4! sm:p-6!">
      <header className="mb-6! flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Raport livrări · regula B (§8)</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Drăxlmaier Bălți</h1>
          <p className="mt-1! text-[12.5px] text-neutral-500">
            Din GPS, ziua întreagă a fiecărei mașini · rulat{' '}
            {new Date(a.rulat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Chisinau' })}
            {' '}· bilanțul km iese pe {a.zileBilantOk} din {a.zile} zile · măsurat pe {a.economie.esantion} din {a.economie.zileLV} zile-mașină luni–vineri, extrapolat pe restul
            {a.economie.saptAtipica && <b className={ROSU}> · săptămână atipică (flota sub jumătate din săptămâna precedentă)</b>}
            {inCurs && <b className={ROSU}> · săptămâna în curs, cifrele nu-s finale</b>}
          </p>
        </div>
        <Saptamana baza={`${URL_UZ}&`} activa={a.saptamina} eticheta={interval(a.saptamina, a.pana_la)}
          optiuni={(saptamani.length ? saptamani : [a.saptamina]).map((s) => ({ v: s, e: interval(s) }))} />
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card titlu="Se poate tăia cu o dispoziție · R1b + R3" val={n0(c.R1bR3)} mare
          sub={`Ocolul pe acasă între curse și drumul acasă între tur și retur. ${a.indicatii.peste_prag} mașini peste ${PRAG_INDICATII_KM} km/săpt.`} />
        <Card titlu="Cost de azi · regula B" val={n0(c.B)}
          sub={`R1a + R1b + R3, nu economie garantată${c.deLamurit.B >= 0.5 ? ` · din care ${n0(c.deLamurit.B)} km de lămurit scoși` : ''}${c.lei ? ` · ≈ ${n0(c.lei)} lei pe mașinile cu normă` : ''}`} />
        <Card titlu="Marginile zilei · R1a" val={n0(c.R1a)} sub="Drumul de acasă la prima cursă și seara înapoi — se taie doar cu alt șofer din satul de start." />
        <Card titlu="Timp liber · brambura (§11)" val={`${n0(TL.km_total)} · ${n0(TL.km_brambura_total)}`}
          sub={`Doar în km neexplicați de §5. Peste ${TL.prag_km} km: ${TL.masini_peste_prag.join(', ') || '—'} · brambura: ${TL.masini_peste_prag_brambura.join(', ') || '—'}.`} />
      </div>

      <div className="mb-3! mt-9! flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Mașină cu mașină · km pe săptămână, extrapolați</h2>
        <span className="text-[12px] text-neutral-500">apasă un rând ca să vezi zilele, bucată cu bucată</span>
      </div>
      <div className="overflow-x-auto rounded-[12px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <table className="w-full min-w-[1100px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#9B1B30]/[0.04] text-[10px] uppercase tracking-[0.08em] text-neutral-500">
              {cols.map((h, i) => <th key={h} className={`px-3! py-2.5! font-bold ${i >= 4 || i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {masini.map((m) => {
              const des = deschis === m.m;
              const d = (m.extrapolat.R1b ?? 0) + (m.extrapolat.R3 ?? 0);
              return (
                <Fragment key={m.m}>
                  <tr onClick={() => setDeschis(des ? null : m.m)} aria-expanded={des}
                    className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50">
                    <td className="px-3! py-2! font-mono font-semibold">{m.m}{m.deLamurit && <span className={`ml-1! text-[11px] ${ROSU}`} title={m.deLamurit}>de lămurit</span>}</td>
                    <td className="px-3! py-2! text-[12px] text-neutral-600 dark:text-neutral-300">{m.rute.map((r) => `${linie(r.r)} (${r.zile} z)`).join(', ') || '—'}</td>
                    <td className="px-3! py-2! text-right font-mono tabular-nums" title="zile măsurate / zile lucrate luni–vineri">{m.zileIncluse}/{m.zile}</td>
                    <td className="px-3! py-2!">{m.casa ?? '—'}</td>
                    {m.extrapolat.B == null
                      ? <td colSpan={4} className="px-3! py-2! text-right text-neutral-500">nemăsurat (nicio zi măsurabilă)</td>
                      : <>
                          <td className="px-3! py-2! text-right font-mono tabular-nums text-neutral-500">{n0(m.extrapolat.R1a)}</td>
                          <td className={`px-3! py-2! text-right font-mono tabular-nums ${d >= PRAG_INDICATII_KM ? `font-bold ${VERDE}` : ''}`}>{n0(m.extrapolat.R1b)}</td>
                          <td className={`px-3! py-2! text-right font-mono tabular-nums ${d >= PRAG_INDICATII_KM ? `font-bold ${VERDE}` : ''}`}>{n0(m.extrapolat.R3)}</td>
                          <td className="px-3! py-2! text-right font-mono tabular-nums">{n0(m.extrapolat.B)}{m.deLamuritScos.B >= 0.5 && <div className="text-[11px] text-neutral-500">−{n0(m.deLamuritScos.B)} de lămurit</div>}</td>
                        </>}
                    <td className={`px-3! py-2! text-right font-mono tabular-nums ${m.liber?.peste_prag ? `font-bold ${ROSU}` : 'text-neutral-500'}`}>{m.liber ? n1(m.liber.km) : '—'}</td>
                    <td className={`px-3! py-2! text-right font-mono tabular-nums ${m.liber?.peste_prag_brambura ? `font-bold ${ROSU}` : 'text-neutral-500'}`}>{m.liber ? n1(m.liber.km_brambura ?? 0) : '—'}</td>
                  </tr>
                  {des && (
                    <tr className="bg-neutral-50/70 dark:bg-neutral-800/30">
                      <td colSpan={cols.length} className="px-4! py-3!">
                        <p className="mb-2! text-[12.5px] text-neutral-500">
                          Măsurat (fără extrapolare): R1a {n1(m.economie.R1a)} · R1b {n1(m.economie.R1b)} · R3 {n1(m.economie.R3)} · B {n1(m.economie.B)} km
                          {m.economie.A != null && <> · A (LEAR R1, doar referință, nu se aplică) {n1(m.economie.A)} km</>}
                          {' '}· așteaptă deja lângă uzină: {m.dejaLangaUzina.intervale} intervale, {n1(m.dejaLangaUzina.km)} km
                          {m.liber && <> · §11: neclar {n1(m.liber.km_neclar)} · navetă {n1(m.liber.km_naveta)} · reparație {n1(m.liber.km_reparatie)} · altă uzină {n1(m.liber.km_alta_uzina)} · explicat de §5 {n1(m.kmExplicatF2)} km</>}
                          {m.steaguriLiber.length > 0 && <> · {m.steaguriLiber.join('; ')}</>}
                        </p>
                        <Zile m={m} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 font-semibold dark:border-neutral-700">
              <td className="px-3! py-2.5!" colSpan={4}>Pe {masini.length} mașini{c.nemasurate.length ? ` · nemăsurate: ${c.nemasurate.join(', ')}` : ''}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n0(c.R1a)}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n0(c.R1b)}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n0(c.R3)}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n0(c.B)}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n1(TL.km_total)}</td>
              <td className="px-3! py-2.5! text-right font-mono tabular-nums">{n1(TL.km_brambura_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h2 className="mb-2! mt-9! text-xs font-bold uppercase tracking-widest text-neutral-500">Indicații pentru dispecer (§12) · nu pleacă până la «da»</h2>
      <p className="text-[12.5px] text-neutral-500">
        {a.indicatii.top.length
          ? a.indicatii.top.map((x) => `${x.m}: R1b ${n0(x.R1b)} + R3 ${n0(x.R3)} = ${n0(x.R1bR3)} km/săpt. (${x.zile} zile)`).join(' · ')
          : 'Nicio mașină peste prag.'}
        {' '}Întrebările: «între curse, unde așteaptă mașina — la capăt sau la uzină, nu acasă?» și «între tur și retur, așteaptă lângă uzină?».
      </p>

      <h2 className="mb-2! mt-9! text-xs font-bold uppercase tracking-widest text-neutral-500">Timp liber și brambura (§11) · km pe săptămână</h2>
      <p className="text-[12.5px] text-neutral-500">
        liber {n1(TL.km_total)} · brambura {n1(TL.km_brambura_total)} · neclar {n1(TL.km_neclar_total)} · reparație {n1(TL.km_reparatie_total)} · altă uzină {n1(TL.km_alta_uzina_total)}
        {' '}· explicat de §5 (nu intră în §11) {n1(TL.km_explicat_f2)} · înainte de prioritatea §5: liber {n1(TL.brut.km)}, brambura {n1(TL.brut.km_brambura)}.
        {' '}Mesajul către ADMIN nu pleacă automat până la «da»-ul lui Ion (§11.10).
      </p>
      {a.deLamurit.length > 0 && (
        <div className="mt-3! space-y-1! text-[12.5px]">
          <b>De lămurit — posibilă cursă a firmei (§11.8):</b>
          {a.deLamurit.map((x) => <p key={x.m}><span className="font-mono font-semibold">{x.m}</span> <span className="text-neutral-500">{x.motiv}</span></p>)}
        </div>
      )}

      <Liste a={a} />

      <h2 className="mb-2! mt-9! text-xs font-bold uppercase tracking-widest text-neutral-500">Control (§10.4)</h2>
      <p className="text-[12.5px] text-neutral-500">
        {probe.map(([k, p]) => <span key={k} className={p.pica ? ROSU : ''}>{k} {p.trec}/{p.conditie}{p.pica ? ` (${p.pica} picate)` : ''} · </span>)}
        P10 «un km, un singur loc» {P10.masini - P10.pica.length}/{P10.masini}, pe pași {P10.masini - P10.picaC.length}/{P10.masini}
        {a.control.bilant && <> · bilanț {a.control.bilant.ok}/{a.control.bilant.zile} zile (abatere max {n1(a.control.bilant.maxDifPct)} %)</>}
        {a.control.schimb3 && <> · atingeri ale porții 22:00–06:00 în afara ferestrelor: {a.control.schimb3.inAfaraFerestrelor}</>}
        {' '}· referințe (md5): {Object.entries(a.referinte).map(([k, v]) => `${k} ${v.slice(0, 8)}`).join(', ')}
        {a.economie.normaLipsa.length > 0 && <> · fără normă (fără lei): {a.economie.normaLipsa.join(', ')}</>}
      </p>
      <div className="mt-6! space-y-1.5! text-[12.5px] text-neutral-500">
        <p>
          Categoriile (§5), în ordine: <b>cu oameni</b>; <b>livrare</b> = drumul gol de la locul nopții la prima cursă și seara înapoi, iar între
          curse doar <b>ocolul</b> pe acasă peste drumul direct; <b>gol pe rută</b>; <b>gol între tur și retur</b> (R3 = doar km-ii din afara zonei
          uzinei, peste pragul de 30 km); <b>parc</b> = așteptare lângă uzină; <b>legătură</b> = drumul direct între linii diferite. Regula B
          (§8) = R1a + R1b + R3, cost de azi; R2 nu se propune; A (LEAR R1) e doar referință.
        </p>
        <p>Total pe săptămână (toate zilele): cu oameni {n0(t.cuOameni)} · livrare {n0(t.livrare)} · gol pe rută {n0(t.golRuta)} · între tur și retur {n0(t.golTure)} · parc {n0(t.parc)} · legătură {n0(t.legatura)} · deplasare {n0(t.deplasare)} · necunoscut {n0(t.necunoscut)} km.</p>
        <p className="text-[11px]">Categoriile: {CAT_DRAX.map((k) => NUME_CAT_DRAX[k]).join(' · ')}.</p>
      </div>
    </div>
  );
}
