import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Политика конфиденциальности' };

export default function Page() {
  return <LegalPage kind="privacy" locale="ru" />;
}
