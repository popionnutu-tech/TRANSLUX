import type { Metadata } from 'next';
import { BiletPage } from '@/components/bilet/BiletPage';

// ION-197: pagina biletului online (codul din cale e secretul comenzii).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ваш билет', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ cod: string }>; searchParams: Promise<{ plata?: string; doar?: string }> }) {
  const [{ cod }, sp] = await Promise.all([params, searchParams]);
  return <BiletPage cod={cod} locale="ru" plataNu={sp.plata === 'nu'} doar={sp.doar === '1'} />;
}
