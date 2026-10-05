export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { verifySession, requireRole } from '@/lib/auth';
import { PART_WRITE_ROLES } from '@/lib/piese-access';
import { dubluriCatalog } from '@/lib/piese-nomenclator';
import DubluriClient from './DubluriClient';

export default async function DubluriPage() {
  requireRole(await verifySession(), ...PART_WRITE_ROLES);
  const randuri = await dubluriCatalog(200);
  return (
    <>
      <div className="page-header">
        <h1>Dubluri în catalog</h1>
        <p>
          Piese diferite cu ACELAȘI cod de articol. Alegi pe care o păstrezi; celelalte se desființează,
          iar codurile lor de bare trec la cea păstrată. <Link href="/piese/catalog">← înapoi la Catalog</Link>
        </p>
      </div>
      <DubluriClient randuri={randuri} />
    </>
  );
}
