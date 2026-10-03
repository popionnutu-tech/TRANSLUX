import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

// ION-208: condițiile de vânzare a biletelor online (HG 854/2006).
export const metadata: Metadata = { title: 'Условия продажи' };

export default function Page() {
  return <LegalPage kind="terms" locale="ru" />;
}
