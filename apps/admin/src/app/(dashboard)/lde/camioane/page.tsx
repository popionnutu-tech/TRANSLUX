export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { getPlanificare } from './planificare/actions';
import BandaClient from './BandaClient';

const ZILE_IMPLICIT = 10;
// 21, nu 31: PostgREST taie la 1000 de rânduri, iar 39 de camioane cu o cursă pe
// zi ating pragul din ziua 26. Tăierea e și detectată în `getPlanificare` —
// plafonul singur n-ar fi o apărare, doar o speranță (review performanță, 01.09).
const ZILE_MAX = 21;

/** Banda pornește de ieri, ca să se vadă cursele deja în drum. */
function ieriChisinau(): string {
  const d = new Date(`${chisinauTodayIso()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function BandaPage({ searchParams }: { searchParams: Promise<{ from?: string; zile?: string }> }) {
  const session = await verifySession();
  if (!session || !poateAccesa(session.role, '/lde/camioane')) redirect('/login');

  const { from, zile } = await searchParams;
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : ieriChisinau();
  const n = Math.min(ZILE_MAX, Math.max(3, Number(zile) || ZILE_IMPLICIT));

  const data = await getPlanificare(start, n);
  return <BandaClient {...data} />;
}
