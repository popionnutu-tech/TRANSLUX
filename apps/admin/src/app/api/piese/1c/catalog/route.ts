import { verifySession, requireRole } from '@/lib/auth';
import { catalogForExport } from '@/lib/piese-ops';
import { buildCatalogXML } from '@/lib/piese-commerceml';

export async function GET() {
  try { requireRole(await verifySession(), 'ADMIN', 'CONTABIL'); } catch { return new Response('Acces interzis', { status: 403 }); }
  const { groups, parts } = await catalogForExport();
  const xml = buildCatalogXML(new Date().toISOString().slice(0, 19), groups, parts);
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="1c-import-catalog.xml"' } });
}
