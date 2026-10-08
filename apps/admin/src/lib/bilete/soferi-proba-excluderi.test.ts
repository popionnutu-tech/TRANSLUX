import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Proba fizică (migr. 532, revizia business-logic F4): șoferul de probă (drivers.is_test) nu are voie să apară în listele
// de «șoferi activi» ale dispecerului, graficului, penalităților, rapoartelor și ale botului. Orice citire nouă
// `from('drivers') … .eq('active', true)` trebuie să-l excludă (`.neq('is_test', true)`) sau să fie pe lista de mai jos.

const RADACINA = join(__dirname, '../../../../..');
const DIRS = ['apps/admin/src', 'apps/bot/src'];
/** Citiri care TREBUIE să-l găsească pe șoferul de probă sau care nu pot da peste el. */
const PERMISE = [
  'apps/admin/src/lib/bilete/sofer-auth.ts', // identitatea în mini app — șoferul de probă se autentifică aici
  'apps/bot/src/handlers/bilete-azi.ts', // butonul spre mini app-ul de șofer
  'apps/bot/src/handlers/sofer.ts', // legarea prin telefon (șoferul de probă n-are telefon)
  'apps/bot/src/services/bileteClienti.ts', // «e șofer?» după telegram_id, doar numărare
  'apps/bot/src/services/db.ts:getActiveDrivers', // cere directions ⊇ interurban; șoferul de probă are '{}'
  'apps/admin/src/app/(dashboard)/lde/parc/actions.ts', // doar is_lde=true sau căutare după nume exact la crearea LDE
];

function fisiere(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' || n === '.next' ? [] : fisiere(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('șoferul de probă e exclus din listele de șoferi activi', () => {
  it('fiecare from(\'drivers\') cu active=true are .neq(\'is_test\', true) sau e permis', () => {
    const lipsa: string[] = [];
    for (const d of DIRS) for (const f of fisiere(join(RADACINA, d))) {
      const rel = relative(RADACINA, f);
      const linii = readFileSync(f, 'utf8').split('\n');
      linii.forEach((l, i) => {
        if (!l.includes("from('drivers')")) return;
        // interogarea până la «;» sau până la următorul .from( (în Promise.all stau mai multe pe rând)
        const tot = linii.slice(i, i + 8).join(' ').split(';')[0];
        const start = tot.indexOf("from('drivers')");
        const urm = tot.indexOf('.from(', start + 5);
        const bucata = urm > 0 ? tot.slice(start, urm) : tot.slice(start);
        if (!bucata.includes(".eq('active', true)") || bucata.includes('is_test')) return;
        if (PERMISE.includes(rel)) return;
        const functia = [...linii.slice(0, i)].reverse().find((x) => /function \w+/.test(x))?.match(/function (\w+)/)?.[1];
        if (functia && PERMISE.includes(`${rel}:${functia}`)) return;
        lipsa.push(`${rel}:${i + 1}`);
      });
    }
    expect(lipsa).toEqual([]);
  });
});
