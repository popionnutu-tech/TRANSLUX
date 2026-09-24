export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { getRaport, getSaptamani } from './actions';
import ReguliClient from './ReguliClient';
import ReguliSebnClient, { type ReguliSebn } from './ReguliSebnClient';
import RaportSebn, { eticheta } from './RaportSebn';
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
] as const;

export default async function LdeReguliPage({
  searchParams,
}: {
  searchParams: Promise<{ saptamina?: string; uz?: string }>;
}) {
  const { saptamina, uz } = await searchParams;
  const alese = uz === 'sebn' ? 'sebn' : 'lear';

  const nav = (
    <nav aria-label="Uzina" className="flex gap-1.5 px-4! pt-3!">
      {UZINE.map((u) => (
        <Link
          key={u.id}
          href={u.href}
          aria-current={u.id === alese ? 'page' : undefined}
          className={`rounded-md border px-3! py-1! text-[12px] font-semibold no-underline ${
            u.id === alese
              ? 'border-transparent bg-[var(--primary)] text-white'
              : 'border-neutral-200 text-neutral-500 dark:border-neutral-700'
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
    const { rows, brambura, pretMotorina } = await incarcaLivrare(luni, duminica, 0, UZINE_IMPLICITE);
    const alegeri = Array.from({ length: 8 }, (_, i) => {
      const w = saptamanaSebn(undefined, i);
      return { luni: w.luni, eticheta: eticheta(w.luni, w.duminica) };
    });
    return (
      <>
        {nav}
        <RaportSebn s={{ luni, duminica, rows, brambura, pretMotorina, leiImplicit: LEI_PE_KM, alegeri }} />
        <ReguliSebnClient date={date} />
      </>
    );
  }

  const [raport, saptamani] = await Promise.all([
    getRaport('LEAR Ungheni', saptamina),
    getSaptamani('LEAR Ungheni'),
  ]);
  return <>{nav}<ReguliClient raport={raport} saptamani={saptamani} /></>;
}
