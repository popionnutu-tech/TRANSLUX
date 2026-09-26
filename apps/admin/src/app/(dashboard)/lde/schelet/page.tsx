export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReactNode } from 'react';
import Link from 'next/link';
import ScheletClient, { type Schelet } from './ScheletClient';
import ScheletSebnClient, { type ScheletSebn } from './ScheletSebnClient';
import ScheletFlorestiClient, { type ScheletFloresti } from './ScheletFlorestiClient';
import ScheletMejgorodClient, { type ScheletMejgorod } from './ScheletMejgorodClient';
import ScheletBriceniClient, { type ScheletBriceni } from './ScheletBriceniClient';
import ScheletToateClient from './ScheletToateClient';
import {
  type Retea, learLaToate, sebnLaToate, florestiLaToate, mejgorodLaToate, briceniLaToate,
} from './toate';

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
// Ion, 25.09.2026: «scheletul rute Trox și suburbane nu a apărut în LDE» — schelet-briceni.json (ION-70): cele 11
// rute suburbane (Coteala comun) și 6 Trox pe o hartă, aceleași mașini; ales cu ?uz=briceni.
//
// Ion, 26.09.2026: «daca se adauga o directie noua in schelet, automat apare in toate?» (ION-88) — acum da:
// fiecare rețea e un rând în registrul de mai jos, cu fila ei ȘI cu funcția ei pentru «Toate rutele»
// (câmp obligatoriu), iar fila «Toate» se construiește din tot registrul.
type Retea_<T> = {
  id: string; nume: string; fisier: string; href: string;
  fila: (date: T) => ReactNode; laToate: (date: T) => Retea[];
};
const rand = <T,>(r: Retea_<T>) => r as Retea_<unknown>;

const RETELE = [
  rand<Schelet>({ id: 'lear', nume: 'LEAR Ungheni', fisier: 'schelet.json', href: '/lde/schelet',
    fila: (d) => <ScheletClient schelet={d} />, laToate: learLaToate }),
  rand<ScheletSebn>({ id: 'sebn', nume: 'SEBN Orhei și Strășeni', fisier: 'schelet-sebn.json', href: '/lde/schelet?uz=sebn',
    fila: (d) => <ScheletSebnClient schelet={d} />, laToate: sebnLaToate }),
  rand<ScheletFloresti>({ id: 'floresti', nume: 'LEAR Florești', fisier: 'schelet-floresti.json', href: '/lde/schelet?uz=floresti',
    fila: (d) => <ScheletFlorestiClient schelet={d} />, laToate: florestiLaToate }),
  rand<ScheletMejgorod>({ id: 'mejgorod', nume: 'Rute interurbane', fisier: 'schelet-mejgorod.json', href: '/lde/schelet?uz=mejgorod',
    fila: (d) => <ScheletMejgorodClient schelet={d} />, laToate: mejgorodLaToate }),
  rand<ScheletBriceni>({ id: 'briceni', nume: 'Trox + suburban Briceni', fisier: 'schelet-briceni.json', href: '/lde/schelet?uz=briceni',
    fila: (d) => <ScheletBriceniClient schelet={d} />, laToate: briceniLaToate }),
];

// Ion, 25.09.2026: «fă o hartă unică unde să se aplice toate rutele… să fie ultima fișă toate» (ION-67).
const FILE = [...RETELE, { id: 'toate', nume: 'Toate rutele', href: '/lde/schelet?uz=toate' }];

const citeste = async (fisier: string): Promise<unknown> =>
  JSON.parse(await readFile(path.join(process.cwd(), 'public', 'lde', fisier), 'utf8'));

export default async function LdeScheletPage({ searchParams }: { searchParams: Promise<{ uz?: string }> }) {
  const { uz } = await searchParams;
  const aleasa = FILE.find((u) => u.id === uz) ?? FILE[0];
  const retea = RETELE.find((r) => r.id === aleasa.id);
  const continut = retea
    ? retea.fila(await citeste(retea.fisier))
    : <ScheletToateClient retele={(await Promise.all(RETELE.map(async (r) => r.laToate(await citeste(r.fisier))))).flat()} />;

  return (
    <>
      <nav aria-label="Uzina" style={{ display: 'flex', gap: 6, padding: '12px 16px 0' }}>
        {FILE.map((u) => (
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
      {continut}
    </>
  );
}
