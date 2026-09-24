export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import ScheletClient, { type Schelet } from './ScheletClient';
import ScheletSebnClient, { type ScheletSebn } from './ScheletSebnClient';

// Scheletul e fix prin definiție — Ion, 23.09.2026: «să îl fixez, pe viitor să nu mai umblăm la
// el». Deci stă ca fișier în repo, nu ca tabel în bază: o versiune, una singură, care se schimbă
// doar printr-un commit. Se citește pe server ca pagina să nu depindă de o cerere din browser.
//
// Ion, 24.09.2026: «salvează scheletul SEBN în LDE» — al doilea fișier, schelet-sebn.json (Orhei
// și Strășeni), pe aceeași pagină, ales cu ?uz=sebn. LEAR Ungheni rămâne cum era.
const UZINE = [
  { id: 'lear', nume: 'LEAR Ungheni' },
  { id: 'sebn', nume: 'SEBN Orhei și Strășeni' },
] as const;

export default async function LdeScheletPage({ searchParams }: { searchParams: Promise<{ uz?: string }> }) {
  const { uz } = await searchParams;
  const sebn = uz === 'sebn';
  const cale = path.join(process.cwd(), 'public', 'lde', sebn ? 'schelet-sebn.json' : 'schelet.json');
  const date = JSON.parse(await readFile(cale, 'utf8'));

  const alese = sebn ? 'sebn' : 'lear';
  return (
    <>
      <nav aria-label="Uzina" style={{ display: 'flex', gap: 6, padding: '12px 16px 0' }}>
        {UZINE.map((u) => (
          <Link
            key={u.id}
            href={u.id === 'lear' ? '/lde/schelet' : '/lde/schelet?uz=sebn'}
            aria-current={u.id === alese ? 'page' : undefined}
            style={{
              fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 6, textDecoration: 'none',
              border: '1px solid var(--border-accent)',
              background: u.id === alese ? 'var(--primary)' : 'transparent',
              color: u.id === alese ? '#fff' : 'var(--text-secondary)',
            }}
          >{u.nume}</Link>
        ))}
      </nav>
      {sebn
        ? <ScheletSebnClient schelet={date as ScheletSebn} />
        : <ScheletClient schelet={date as Schelet} />}
    </>
  );
}
