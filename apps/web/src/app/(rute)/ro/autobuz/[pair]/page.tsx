import type { Metadata } from 'next';
import { RoutePage, routeMetadata } from '@/components/route-page';
import { routeStaticParams } from '@/lib/route-pages';

// Prerandată la build pentru toate perechile cu pagină (ION-203), apoi reîmprospătată din oră
// în oră (ISR, ION-153). Stă în grupul (rute), în afara ro/loading.tsx: sub Suspense, notFound() ar răspunde 200.
export const revalidate = 3600;
// O pereche nouă (apărută în orar după build) se randează la prima cerere, nu dă 404.
export const dynamicParams = true;

export function generateStaticParams() {
  return routeStaticParams();
}

type Props = { params: Promise<{ pair: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return routeMetadata((await params).pair, 'ro');
}

export default async function Page({ params }: Props) {
  return <RoutePage pair={(await params).pair} locale="ro" />;
}
