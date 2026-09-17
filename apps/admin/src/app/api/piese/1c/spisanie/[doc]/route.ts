import { verifySession, requireRole } from '@/lib/auth';
import { pregatesteSpisanie } from '@/lib/piese-1c-export';

// Descărcarea documentului «Списание запчастей» pentru o eliberare.
//
// Aceleași roluri ca restul integrării (ADMIN/CONTABIL): fișierul ajunge în contabilitate, deci nu e o
// treabă de depozit.
export async function GET(_req: Request, ctx: { params: Promise<{ doc: string }> }) {
  try { requireRole(await verifySession(), 'ADMIN', 'CONTABIL'); }
  catch { return new Response('Acces interzis', { status: 403 }); }

  const docId = Number((await ctx.params).doc);
  if (!Number.isInteger(docId) || docId <= 0) return new Response('Document invalid', { status: 400 });

  try {
    const r = await pregatesteSpisanie(docId);
    // 409, nu 500: nu e o defecțiune, e o stare a datelor pe care omul o poate citi și rezolva.
    if (!r.ok) {
      return new Response(`Nu pot compune documentul:\n${r.lipsuri.map((l) => `• ${l.ce}: ${l.detaliu}`).join('\n')}`,
        { status: 409, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return new Response(r.xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${r.nume}"`,
      },
    });
  } catch (e: any) {
    return new Response(String(e?.message || 'Eroare'), { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
