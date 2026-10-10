import type { Metadata } from 'next';
import { GasesteBilet } from '@/components/bilet/GasesteBilet';

// «Găsește biletul meu» (552): linkurile biletelor prin SMS pe telefonul cumpărătorului.
export const metadata: Metadata = { title: 'Найти мой билет · TRANSLUX', robots: { index: false, follow: true } };

export default function Page() {
  return <GasesteBilet locale="ru" />;
}
