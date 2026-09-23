export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ScheletClient, { type Schelet } from './ScheletClient';

// Scheletul e fix prin definiție — Ion, 23.09.2026: «să îl fixez, pe viitor să nu mai umblăm la
// el». Deci stă ca fișier în repo, nu ca tabel în bază: o versiune, una singură, care se schimbă
// doar printr-un commit. Se citește pe server ca pagina să nu depindă de o cerere din browser.
export default async function LdeScheletPage() {
  const cale = path.join(process.cwd(), 'public', 'lde', 'schelet.json');
  const schelet: Schelet = JSON.parse(await readFile(cale, 'utf8'));
  return <ScheletClient schelet={schelet} />;
}
