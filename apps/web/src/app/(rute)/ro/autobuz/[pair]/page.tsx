import type { Metadata } from 'next';
import { RoutePage, routeMetadata } from '@/components/route-page';

// ISR: randată la prima cerere, apoi reîmprospătată din oră în oră (ION-153).
// Stă în grupul (rute), în afara ro/loading.tsx: sub Suspense, notFound() ar răspunde 200.
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ pair: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return routeMetadata((await params).pair, 'ro');
}

export default async function Page({ params }: Props) {
  return <RoutePage pair={(await params).pair} locale="ro" />;
}
