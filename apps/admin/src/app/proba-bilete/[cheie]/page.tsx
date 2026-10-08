import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { cheieProbaValida } from '@/lib/bilete/proba-reguli';
import ProbaClient from './ProbaClient';

// Pagina de probă fizică a biletelor online (migr. 532, Ion 08.10.2026: «am nevoie de pagină test separată de site»,
// «pagina fără login», «biletul 10 lei»). Fără sesiune: o deschide doar linkul cu cheia secretă din BILETE_PROBA_CHEIE,
// până la BILETE_PROBA_PANA_LA; altfel 404. Acțiunile verifică cheia din nou (actions.ts).

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Proba biletelor',
  referrer: 'no-referrer',
  robots: { index: false, follow: false, nocache: true },
};

export default async function Page({ params }: { params: Promise<{ cheie: string }> }) {
  const { cheie } = await params;
  if (!cheieProbaValida(cheie, { cheie: process.env.BILETE_PROBA_CHEIE, panaLa: process.env.BILETE_PROBA_PANA_LA }, chisinauTodayIso())) notFound();
  return <ProbaClient cheie={cheie} />;
}
