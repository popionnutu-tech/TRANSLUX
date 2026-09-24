export const dynamic = 'force-dynamic';

import { getRaport } from './actions';
import ReguliClient from './ReguliClient';

// Raportul săptămânal al celor trei reguli de economie (ION-48). Îl scrie duminică seara
// lear-analiza.mjs de pe VPS; aici se citește ultimul rând și se desenează.
export default async function LdeReguliPage() {
  const raport = await getRaport();
  return <ReguliClient raport={raport} />;
}
