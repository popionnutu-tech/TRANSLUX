import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Politica de confidențialitate' };

export default function Page() {
  return <LegalPage kind="privacy" locale="ro" />;
}
