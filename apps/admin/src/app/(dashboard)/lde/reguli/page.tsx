export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { getRaport, getSaptamani } from './actions';
import ReguliClient from './ReguliClient';
import ReguliSebnClient, { type ReguliSebn } from './ReguliSebnClient';

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
    return <>{nav}<ReguliSebnClient date={date} /></>;
  }

  const [raport, saptamani] = await Promise.all([
    getRaport('LEAR Ungheni', saptamina),
    getSaptamani('LEAR Ungheni'),
  ]);
  return <>{nav}<ReguliClient raport={raport} saptamani={saptamani} /></>;
}
