import type { Metadata } from 'next';
import { TelegramClientPage } from '@/components/telegram/TelegramClientPage';

// ION-249: mini app-ul clientului din Telegram (biletele mele, harta autobuzului, căutare). Nu se indexează.
export const metadata: Metadata = { title: 'Biletele mele', robots: { index: false, follow: false } };
// Selectoarele se regenerează ca prima pagină (ION-232); biletele nu stau în HTML, ci vin din browser.
export const revalidate = 900;

export default function Page() {
  return <TelegramClientPage locale="ro" />;
}
