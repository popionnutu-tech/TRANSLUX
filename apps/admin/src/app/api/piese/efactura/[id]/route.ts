import { verifySession, requireRole } from '@/lib/auth';
import { saleUblData } from '@/lib/piese-ops';
import { buildInvoiceUBL } from '@/lib/piese-ubl';
import { invoiceReadFilter } from '@/lib/piese-access';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // requireRole aruncă pe sesiune lipsă → 403 înainte de orice citire; păstrăm Session-ul non-null pe care îl întoarce.
  let session;
  try { session = requireRole(await verifySession(), 'ADMIN', 'CONTABIL', 'VINZATOR', 'GESTIONAR'); }
  catch { return new Response('Acces interzis', { status: 403 }); }
  const { id } = await params;
  const data = await saleUblData(Number(id), await invoiceReadFilter(session));
  if (!data) return new Response('Factură inexistentă', { status: 404 });
  return new Response(buildInvoiceUBL(data), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="efactura-${data.series}${data.number}.xml"` },
  });
}
