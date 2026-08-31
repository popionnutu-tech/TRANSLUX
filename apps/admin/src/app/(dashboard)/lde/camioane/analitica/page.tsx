export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { getAnalitica } from './actions';
import AnaliticaClient from './AnaliticaClient';

/** Data e validă doar dacă și EXISTĂ: `9999-99-99` trecea de regex și golea
 *  lista de zile, iar pagina cădea cu 500 (security review 31.08). */
function dataValida(v: string | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export default async function AnaliticaPage({ searchParams }: { searchParams: Promise<{ de?: string; la?: string }> }) {
  const session = await verifySession();
  if (!session || !poateAccesa(session.role, '/lde/camioane/analitica')) redirect('/login');

  const { de, la } = await searchParams;
  const azi = chisinauTodayIso();
  // Implicit: ultimele 30 de zile — destul pentru o lună de curse, fără să ceară
  // filtre la prima deschidere.
  const acum30 = (() => {
    const d = new Date(`${azi}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 29);
    return d.toISOString().slice(0, 10);
  })();

  const start = dataValida(de) ? de : acum30;
  const stop = dataValida(la) ? la : azi;
  const data = await getAnalitica(start <= stop ? start : stop, start <= stop ? stop : start);
  return <AnaliticaClient {...data} />;
}
