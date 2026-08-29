'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed } from '@/lib/piese-access';
import { issueAlert, createIssue, appendIssue, todayIssueDocs, docLines, docWarehouses, type IssueLine } from '@/lib/piese';
import { canSeeCost } from '@/lib/piese-access';
import { auditWrite } from '@/lib/audit';

const ISSUE_ROLES = ['ADMIN', 'VINZATOR', 'GESTIONAR'] as const;
// Plafon de sanity: RPC-ul ține un lock pe document și pe fiecare piesă, într-o singură tranzacție.
const MAX_LINES = 200;

// Mesaje pentru codurile ridicate de `piese_append_issue` (migr. 294).
const RPC_ERR: Record<string, string> = {
  NOT_ISSUE: 'Document invalid.',
  NOT_CONFIRMED: 'Documentul nu mai poate primi poziții.',
  NOT_TODAY: 'Rashodul e din altă zi — nu i se mai pot adăuga piese. Creează unul nou.',
  DOC_MISMATCH: 'Documentul nu e al acestei mașini sau al acestui depozit.',
  NO_LINES: 'Adaugă cel puțin o piesă.',
  BAD_PART: 'O piesă selectată nu există în catalog.',
  BAD_QTY: 'Cantitatea trebuie să fie mai mare ca 0.',
};

export async function checkIssue(warehouseId: number, vehicleId: number | null, partId: number) {
  const session = requireRole(await verifySession(), ...ISSUE_ROLES);
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: doar depozitul lui
  return issueAlert(warehouseId, vehicleId, partId);
}

// Curăță și validează liniile primite de la client. Aceleași praguri ca RPC-ul, ca o linie acceptată aici
// să nu fie refuzată acolo (și invers) — inclusiv epsilonul, altfel o cantitate infimă ar trece la creare
// și ar fi refuzată la adăugare.
function cleanLines(raw: unknown): IssueLine[] {
  if (!Array.isArray(raw)) throw new Error('Adaugă cel puțin o piesă');
  const lines = raw
    .map((l: any) => ({ part_id: Number(l?.part_id), qty: Number(l?.qty) }))
    .filter((l) => l.part_id);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  if (lines.length > MAX_LINES) throw new Error(`Prea multe poziții (maxim ${MAX_LINES} pe o eliberare).`);
  if (lines.some((l) => !Number.isInteger(l.part_id))) throw new Error(RPC_ERR.BAD_PART);
  if (lines.some((l) => !Number.isFinite(l.qty) || l.qty <= 0.0000001)) throw new Error(RPC_ERR.BAD_QTY);
  return lines;
}

// Ce s-a dat deja azi pe mașina asta — ca depozitarul să vadă înainte să adauge, nu după.
// Se adună TOATE documentele zilei (istoricul are câte unul per piesă), iar adăugarea merge pe cel recent.
export async function loadTodayIssue(warehouseId: number, vehicleId: number) {
  const session = requireRole(await verifySession(), ...ISSUE_ROLES);
  await assertWarehouseAllowed(session, warehouseId);
  const docs = await todayIssueDocs(Number(warehouseId), Number(vehicleId));
  if (!docs.length) return null;
  // Panoul arată doar denumire + cantitate, deci nu cerem costul deloc (apărare în adâncime: dacă nu-l
  // aducem din bază, nu poate ajunge nici din greșeală la un rol care n-are voie să-l vadă).
  const perDoc = await Promise.all(docs.map((d) => docLines(d.id, false)));
  const lines = perDoc.flatMap((r) => r.rows);
  const truncated = perDoc.some((r) => r.truncated);
  return { id: docs[0].id, docCount: docs.length, positions: lines.length, lines, truncated };
}

/**
 * Eliberare pe mașină. Dacă mașina are deja un rashod ASTĂZI în acest depozit, piesele se adaugă pe EL;
 * altfel se creează unul nou. Așa o reparație rămâne un singur document, cum cerea Eduard — în loc de
 * câte un document per piesă, cum era înainte.
 */
export async function submitIssue(payload: {
  warehouse_id: number; vehicle_id: number | null; mechanic_id: number | null;
  breakdown_reason_id: number | null; lines: IssueLine[]; doc_id?: number | null;
}) {
  const session = requireRole(await verifySession(), ...ISSUE_ROLES);
  await assertWarehouseAllowed(session, payload.warehouse_id); // nu poate elibera din alt depozit
  const lines = cleanLines(payload.lines);

  // Fără mașină nu există „rashodul mașinii" — se creează mereu document nou (casare, consum general).
  let target: number | null = null;
  if (payload.vehicle_id) {
    if (payload.doc_id) {
      // `doc_id` vine de la CLIENT, deci se verifică față de DOCUMENT, nu de payload. Fără asta, un cont
      // legat de un depozit ar putea trimite id-ul unui rashod din alt depozit și ar scoate marfă de acolo
      // — ireversibil, mișcările fiind append-only. Aceeași regulă ca `loadDocLines`.
      const wh = await docWarehouses(Number(payload.doc_id));
      if (!wh) throw new Error('Document inexistent');
      await assertWarehouseAllowed(session, wh.from);
      if (wh.from !== Number(payload.warehouse_id)) throw new Error(RPC_ERR.DOC_MISMATCH);
      target = Number(payload.doc_id);
    } else {
      target = (await todayIssueDocs(payload.warehouse_id, payload.vehicle_id))[0]?.id ?? null;
    }
  }

  if (target) {
    let r: Awaited<ReturnType<typeof appendIssue>> | null = null;
    try {
      r = await appendIssue(target, payload.warehouse_id, payload.vehicle_id!, lines);
    } catch (e: any) {
      const code = (e?.message || '').trim();
      // NOT_TODAY = documentul a trecut de miezul nopții între încărcarea ecranului și salvare.
      // Nu e o eroare a omului: cădem pe crearea unui document nou.
      if (code !== 'NOT_TODAY') throw new Error(RPC_ERR[code] || 'Nu am putut adăuga piesele. Reîncearcă.');
    }
    if (r) {
      // ÎN AFARA try-ului de mai sus: stocul s-a mișcat deja. Dacă auditul ar arunca înăuntru, omul ar
      // primi „reîncearcă" pentru o operațiune reușită — iar reîncercarea ar elibera piesele a doua oară.
      await auditWrite({
        adminId: session.id, action: 'APPEND_ISSUE', entity: 'issue', entityId: target,
        after: { pozitii_adaugate: r.added },
      });
      return { ok: true, docId: r.docId, appended: true, shortages: r.shortages };
    }
  }

  const r = await createIssue({ ...payload, lines });
  await auditWrite({
    adminId: session.id, action: 'CREATE_ISSUE', entity: 'issue', entityId: r.docId,
    after: { pozitii: lines.length },
  });
  return { ok: true, docId: r.docId, appended: false, shortages: r.shortages };
}
