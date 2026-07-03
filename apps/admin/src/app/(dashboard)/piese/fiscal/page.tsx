export const dynamic = 'force-dynamic';

import { saleInvoices } from '@/lib/piese-ops';
import { requirePieseFiscal, sellerScoped } from '@/lib/piese-access';
import FiscalClient from './FiscalClient';

export default async function FiscalPage() {
  const session = await requirePieseFiscal();
  const invoices = await saleInvoices(sellerScoped(session.role) ? { sellerId: session.id } : undefined);
  return (
    <>
      <div className="page-header"><h1>Fiscal — e-Factura (SFS)</h1><p>Fiecare vânzare generează factura fiscală în format UBL 2.1 (standardul SFS Moldova). Descarcă XML-ul sau marchează trimiterea.</p></div>
      <div className="alert info">XML-ul UBL e generat complet și corect. Trimiterea automată live în SFS cere accesul + semnătura electronică a companiei (se activează când le avem).</div>
      <FiscalClient invoices={invoices as any[]} />
    </>
  );
}
