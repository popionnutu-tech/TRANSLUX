import { verifySession, requireRole } from '@/lib/auth';
import { offersForExport } from '@/lib/piese-ops';
import { buildOffersXML } from '@/lib/piese-commerceml';

export async function GET() {
  try { requireRole(await verifySession(), 'ADMIN', 'CONTABIL'); } catch { return new Response('Acces interzis', { status: 403 }); }
  const offers = await offersForExport();
  const xml = buildOffersXML(new Date().toISOString().slice(0, 19), offers);
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="1c-offers-stoc-preturi.xml"' } });
}
