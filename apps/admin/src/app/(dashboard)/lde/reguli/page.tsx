export const dynamic = 'force-dynamic';

import { getRaport, getSaptamani } from './actions';
import ReguliClient from './ReguliClient';

// Raportul săptămânal al celor trei reguli de economie (ION-48). Îl scrie duminică seara
// lear-analiza.mjs de pe VPS. Fără `?saptamina=`, se arată ultimul.
export default async function LdeReguliPage({
  searchParams,
}: {
  searchParams: Promise<{ saptamina?: string }>;
}) {
  const { saptamina } = await searchParams;
  const [raport, saptamani] = await Promise.all([
    getRaport('LEAR Ungheni', saptamina),
    getSaptamani('LEAR Ungheni'),
  ]);
  return <ReguliClient raport={raport} saptamani={saptamani} />;
}
