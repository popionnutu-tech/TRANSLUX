import { verifySession, requireRole } from '@/lib/auth';
import { saleUblData } from '@/lib/piese-ops';
import { buildInvoiceUBL } from '@/lib/piese-ubl';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  try { requireRole(session, 'ADMIN', 'CONTABIL', 'VINZATOR'); } catch { return new Response('Acces interzis', { status: 403 }); }
  const { id } = await params;
  const data = await saleUblData(Number(id), session!.role === 'VINZATOR' ? session!.id : undefined);
  if (!data) return new Response('Factură inexistentă', { status: 404 });
  return new Response(buildInvoiceUBL(data), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="efactura-${data.series}${data.number}.xml"` },
  });
}
