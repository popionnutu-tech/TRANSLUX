export const dynamic = 'force-dynamic';

import { saleInvoices } from '@/lib/piese-ops';
import { requirePieseFiscal, invoiceReadFilter } from '@/lib/piese-access';
import FiscalClient from './FiscalClient';

export default async function FiscalPage({ searchParams }: { searchParams: Promise<{ pending?: string }> }) {
  const session = await requirePieseFiscal();
  const pending = (await searchParams)?.pending === '1';
  // undefined = vede toate facturile (migr. 287). saleInvoices tratează deja `undefined` ca „fără filtru".
  const { rows, truncated } = await saleInvoices({ sellerId: await invoiceReadFilter(session), pending });
  return (
    <>
      <div className="page-header"><h1>Fiscal — e-Factura (SFS)</h1><p>Fiecare vânzare generează factura fiscală în format UBL 2.1 (standardul SFS Moldova). Descarcă XML-ul sau marchează trimiterea.</p></div>
      <div className="alert info">XML-ul UBL e generat complet și corect. Trimiterea automată live în SFS cere accesul + semnătura electronică a companiei (se activează când le avem).</div>
      <FiscalClient invoices={rows as any[]} truncated={truncated} pending={pending} />
    </>
  );
}
