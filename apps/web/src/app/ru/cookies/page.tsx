import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Политика cookie' };

export default function Page() {
  return <LegalPage kind="cookies" locale="ru" />;
}
