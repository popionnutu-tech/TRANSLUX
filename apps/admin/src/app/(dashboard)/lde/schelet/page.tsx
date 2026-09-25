export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import ScheletClient, { type Schelet } from './ScheletClient';
import ScheletSebnClient, { type ScheletSebn } from './ScheletSebnClient';
import ScheletFlorestiClient, { type ScheletFloresti } from './ScheletFlorestiClient';
import ScheletMejgorodClient, { type ScheletMejgorod } from './ScheletMejgorodClient';

// Scheletul e fix prin definiție — Ion, 23.09.2026: «să îl fixez, pe viitor să nu mai umblăm la
// el». Deci stă ca fișier în repo, nu ca tabel în bază: o versiune, una singură, care se schimbă
// doar printr-un commit. Se citește pe server ca pagina să nu depindă de o cerere din browser.
//
// Ion, 24.09.2026: «salvează scheletul SEBN în LDE» — al doilea fișier, schelet-sebn.json (Orhei
// și Strășeni), pe aceeași pagină, ales cu ?uz=sebn. LEAR Ungheni rămâne cum era.
// Ion, 25.09.2026: «fă deploy la schelet pe LDE» — al treilea, schelet-floresti.json (ION-58),
// ales cu ?uz=floresti; rutele poartă denumirile din actul de recepție nr. 36.1.
// Ion, 25.09.2026: «pune scheletul de rute în LDE» — al patrulea, schelet-mejgorod.json (ION-55): cele 30 de
// rute interurbane nord ↔ Chișinău, un drum pe rută cu tur = retur, din 100 de zile de GPS; ales cu ?uz=mejgorod.
const UZINE = [
  { id: 'lear', nume: 'LEAR Ungheni', fisier: 'schelet.json', href: '/lde/schelet' },
  { id: 'sebn', nume: 'SEBN Orhei și Strășeni', fisier: 'schelet-sebn.json', href: '/lde/schelet?uz=sebn' },
  { id: 'floresti', nume: 'LEAR Florești', fisier: 'schelet-floresti.json', href: '/lde/schelet?uz=floresti' },
  { id: 'mejgorod', nume: 'Rute interurbane', fisier: 'schelet-mejgorod.json', href: '/lde/schelet?uz=mejgorod' },
] as const;

export default async function LdeScheletPage({ searchParams }: { searchParams: Promise<{ uz?: string }> }) {
  const { uz } = await searchParams;
  const aleasa = UZINE.find((u) => u.id === uz) ?? UZINE[0];
  const cale = path.join(process.cwd(), 'public', 'lde', aleasa.fisier);
  const date = JSON.parse(await readFile(cale, 'utf8'));

  return (
    <>
      <nav aria-label="Uzina" style={{ display: 'flex', gap: 6, padding: '12px 16px 0' }}>
        {UZINE.map((u) => (
          <Link
            key={u.id}
            href={u.href}
            aria-current={u.id === aleasa.id ? 'page' : undefined}
            style={{
              fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 6, textDecoration: 'none',
              border: '1px solid var(--border-accent)',
              background: u.id === aleasa.id ? 'var(--primary)' : 'transparent',
              color: u.id === aleasa.id ? '#fff' : 'var(--text-secondary)',
            }}
          >{u.nume}</Link>
        ))}
      </nav>
      {aleasa.id === 'sebn'
        ? <ScheletSebnClient schelet={date as ScheletSebn} />
        : aleasa.id === 'floresti'
          ? <ScheletFlorestiClient schelet={date as ScheletFloresti} />
          : aleasa.id === 'mejgorod'
            ? <ScheletMejgorodClient schelet={date as ScheletMejgorod} />
            : <ScheletClient schelet={date as Schelet} />}
    </>
  );
}
