export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isVerificareAuthenticated } from '@/lib/verificare-auth';
import { getRouteDetail } from '../actions';
import CheckClient from './CheckClient';

export default async function VerificareRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isVerificareAuthenticated())) redirect('/verificare/login');
  const { id } = await params;
  const routeId = Number(id);
  if (!Number.isFinite(routeId)) notFound();

  const detail = await getRouteDetail(routeId);
  if (!detail) notFound();

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 80px' }}>
      <Link
        href="/verificare"
        style={{ fontSize: 13, color: '#9B1B30', textDecoration: 'none', display: 'inline-block', marginBottom: 12 }}
      >
        ← Toate rutele
      </Link>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#222', margin: '0 0 4px' }}>
        {detail.dest_to_ro}
      </h1>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 18 }}>
        {detail.time_nord && <>Cursa 1: Nord → Chișinău {detail.time_nord}</>}
        {detail.time_nord && detail.time_chisinau && <> · </>}
        {detail.time_chisinau && <>Cursa 2: Chișinău → Nord {detail.time_chisinau}</>}
      </div>

      <CheckClient detail={detail} />
    </main>
  );
}
