import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Politica cookie — TRANSLUX' };

export default function Page() {
  return <LegalPage kind="cookies" locale="ro" />;
}
