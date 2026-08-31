export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';
import { getPlanificare } from './actions';
import PlanificareClient from './PlanificareClient';

const ZILE = 14;

/** Ziua curentă la Chișinău — grila pornește de ieri, ca dispecerul să vadă și cursele în curs. */
function ieriChisinau(): string {
  const azi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Chisinau' }).format(new Date());
  const d = new Date(`${azi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function PlanificarePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const session = await verifySession();
  if (!session || !poateAccesa(session.role, '/lde/camioane/planificare')) redirect('/login');

  const { from } = await searchParams;
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : ieriChisinau();
  const data = await getPlanificare(start, ZILE);
  return <PlanificareClient {...data} />;
}
