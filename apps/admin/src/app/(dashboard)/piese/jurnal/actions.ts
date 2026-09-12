'use server';

import { verifySession } from '@/lib/auth';
import { canReadAudit } from '@/lib/piese-access';
import { auditFeed, type AuditFeedFilter } from '@/lib/audit';

// Jurnalul e DOAR al administratorului (migr. 338). Garda se repetă aici, nu doar pe pagină: acțiunea e un
// endpoint în sine, iar `requirePieseAudit` din pagină nu apără o cerere trimisă direct.
//
// Se cheamă REGULA (`canReadAudit`), nu se rescrie valoarea: dacă mâine se decide că și managerul vede
// jurnalul, pagina s-ar fi deschis iar fiecare filtrare ar fi dat „acces interzis".
export async function loadJurnal(f: AuditFeedFilter) {
  const session = await verifySession();
  if (!session || !(await canReadAudit(session))) throw new Error('Acces interzis');
  return auditFeed({
    // Datele vin ca `YYYY-MM-DD` de la `<input type="date">`, iar autorul ca uuid din lista noastră. Orice
    // altceva se ignoră: baza le-ar refuza cu o eroare de tip, iar omul ar vedea „nu am putut încărca
    // jurnalul" în loc de un filtru care pur și simplu nu s-a aplicat.
    from: isDay(f.from) ? f.from : null,
    to: isDay(f.to) ? f.to : null,
    adminId: isUuid(f.adminId) ? f.adminId : null,
    entity: str(f.entity),
    action: str(f.action),
    q: str(f.q),
    // Cursorul e o PERECHE: ori amândouă, ori niciuna. `Number(null)` dă 0, deci o verificare naivă ar fi
    // transformat „fără cursor" într-un cursor la id 0 — care sare tăcut toate urmele din aceeași secundă.
    ...(isMoment(f.afterAt) && Number.isInteger(f.afterId) && Number(f.afterId) > 0
      ? { afterAt: f.afterAt, afterId: Number(f.afterId) }
      : { afterAt: null, afterId: null }),
  });
}

function isDay(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function isMoment(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null;
}
