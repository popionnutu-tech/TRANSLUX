import type { Metadata } from 'next';
import { BiletPage } from '@/components/bilet/BiletPage';

// ION-197: pagina biletului online (codul din cale e secretul comenzii).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Biletul tău', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ cod: string }>; searchParams: Promise<{ plata?: string }> }) {
  const [{ cod }, sp] = await Promise.all([params, searchParams]);
  return <BiletPage cod={cod} locale="ro" plataNu={sp.plata === 'nu'} />;
}
