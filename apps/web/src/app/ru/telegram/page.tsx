import type { Metadata, Viewport } from 'next';
import { TelegramClientPage } from '@/components/telegram/TelegramClientPage';

// ION-249: mini app-ul clientului din Telegram (мои билеты, карта автобуса, поиск). Nu se indexează.
export const metadata: Metadata = { title: 'Мои билеты', robots: { index: false, follow: false } };
// Selectoarele se regenerează ca prima pagină (ION-232); biletele nu stau în HTML, ci vin din browser.
export const revalidate = 900;
// Pe ecran complet în Telegram, env(safe-area-inset-*) are valoare doar cu viewport-fit=cover (ora, «insula» iPhone-ului).
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function Page() {
  return <TelegramClientPage locale="ru" />;
}
