export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { getRaport, getSaptamani } from './actions';
import ReguliClient from './ReguliClient';
import ReguliSebnClient, { type ReguliSebn } from './ReguliSebnClient';
import RaportSebn, { eticheta, type SaptSebn } from './RaportSebn';
import RaportMejgorod, { type RaportMejgorodDate } from './RaportMejgorod';
import { incarcaLivrare, UZINE_IMPLICITE } from '@/lib/lde/livrare-poster';
import { LEI_PE_KM } from '@/lib/lde/naveta-image';

// Săptămâna luni–duminică: cea cerută sau, fără ea, ultima încheiată; `inapoi` merge cu săptămâni
// întregi în urmă, pentru selector. Ziua se socotește în ora Moldovei, nu în UTC.
function saptamanaSebn(zi?: string, inapoi = 0) {
  const azi = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }));
  const d = zi && /^\d{4}-\d{2}-\d{2}$/.test(zi)
    ? new Date(`${zi}T12:00:00Z`)
    : new Date(Date.UTC(azi.getFullYear(), azi.getMonth(), azi.getDate() - 7 - 7 * inapoi, 12));
  const dow = (d.getUTCDay() + 6) % 7;
  const luni = new Date(d.getTime() - dow * 86400000);
  const dum = new Date(luni.getTime() + 6 * 86400000);
  return { luni: luni.toISOString().slice(0, 10), duminica: dum.toISOString().slice(0, 10) };
}

// Raportul săptămânal al celor trei reguli de economie (ION-48). Îl scrie duminică seara
// lear-analiza.mjs de pe VPS. Fără `?saptamina=`, se arată ultimul.
//
// Ion, 24.09.2026: «salvează în LDE reguli» — regulile SEBN (ION-38) stau alături, cu ?uz=sebn.
// Ele sunt fixe, ca scheletul: fișier în repo, public/lde/reguli-sebn.json.
const UZINE = [
  { id: 'lear', nume: 'LEAR Ungheni', href: '/lde/reguli' },
  { id: 'sebn', nume: 'SEBN Orhei și Strășeni', href: '/lde/reguli?uz=sebn' },
  // Ion, 25.09.2026 (ION-59): «aplică regulile … de la LEAR și aici» — același raport, scris de
  // lear-analiza.mjs --uzina LEAR_FLORESTI, un rând pe săptămână cu uzina 'LEAR Florești'.
  { id: 'floresti', nume: 'LEAR Florești', href: '/lde/reguli?uz=floresti' },
  // Ion, 25.09.2026 (ION-65): «introdu raportul optimizări livrări săptămânal la interurbane aici» —
  // analiza scrisă luni de VPS (mejgorod/cod/saptamanal.sh), un rând pe săptămână cu uzina 'MEJGOROD'.
  { id: 'mejgorod', nume: 'Rute interurbane', href: '/lde/reguli?uz=mejgorod' },
] as const;

export default async function LdeReguliPage({
  searchParams,
}: {
  searchParams: Promise<{ saptamina?: string; uz?: string }>;
}) {
  const { saptamina, uz } = await searchParams;
  const alese = uz === 'sebn' || uz === 'floresti' || uz === 'mejgorod' ? uz : 'lear';

  const nav = (
    <nav aria-label="Uzina" className="flex gap-1.5 px-4! pt-3!">
      {UZINE.map((u) => (
        <Link
          key={u.id}
          href={u.href}
          aria-current={u.id === alese ? 'page' : undefined}
          // culoarea inline: `.dashboard a` din globals.css bate clasele de text
          style={{ color: u.id === alese ? '#fff' : 'var(--text-secondary)' }}
          className={`rounded-md border px-3! py-1! text-[12px] font-semibold no-underline ${
            u.id === alese
              ? 'border-transparent bg-[var(--primary)]'
              : 'border-neutral-200 dark:border-neutral-700'
          }`}
        >{u.nume}</Link>
      ))}
    </nav>
  );

  if (alese === 'sebn') {
    const cale = path.join(process.cwd(), 'public', 'lde', 'reguli-sebn.json');
    const date: ReguliSebn = JSON.parse(await readFile(cale, 'utf8'));
    // Raportul săptămânii (ION-56): livrarea și brambura, din aceeași funcție ca posterul de
    // livrare. Prag 0 — aici se văd toate mașinile, nu doar cele peste 50 km/zi ca pe poster.
    const { luni, duminica } = saptamanaSebn(saptamina);
    const [{ rows, pretMotorina }, raportLiber] = await Promise.all([
      incarcaLivrare(luni, duminica, 0, UZINE_IMPLICITE),
      // timpul liber și brambura după regula LEAR §11 (ION-60) — scrise lunea de sebn-liber.mjs
      getRaport('SEBN', luni),
    ]);
    const liber = raportLiber?.saptamina === luni ? (raportLiber as unknown as SaptSebn['liber']) : null;
    const alegeri = Array.from({ length: 8 }, (_, i) => {
      const w = saptamanaSebn(undefined, i);
      return { luni: w.luni, eticheta: eticheta(w.luni, w.duminica) };
    });
    return (
      <div style={{ contain: 'inline-size' }}>
        {nav}
        {/* același cadru ca ReguliClient (LEAR) — Ion, 25.09 (ION-68): «în aceeași stilistică ca alte uzine» */}
        <div className="mx-auto! max-w-[1160px] p-4! sm:p-6!">
          <RaportSebn s={{ luni, duminica, rows, liber, pretMotorina, leiImplicit: LEI_PE_KM, alegeri }} />
          <ReguliSebnClient date={date} />
        </div>
      </div>
    );
  }

  if (alese === 'mejgorod') {
    const [raport, saptamani] = await Promise.all([
      getRaport('MEJGOROD', saptamina),
      getSaptamani('MEJGOROD'),
    ]);
    return <>{nav}<RaportMejgorod a={raport as unknown as RaportMejgorodDate | null} saptamani={saptamani} /></>;
  }

  const uzina = alese === 'floresti' ? 'LEAR Florești' : 'LEAR Ungheni';
  const [raport, saptamani] = await Promise.all([
    getRaport(uzina, saptamina),
    getSaptamani(uzina),
  ]);
  return <>{nav}<ReguliClient raport={raport} saptamani={saptamani} baza={alese === 'floresti' ? '/lde/reguli?uz=floresti&' : '/lde/reguli?'} /></>;
}
