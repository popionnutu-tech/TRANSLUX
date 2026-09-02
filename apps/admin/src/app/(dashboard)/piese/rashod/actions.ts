'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed } from '@/lib/piese-access';
import { issueAlert, createIssue, appendIssue, todayIssueDocs, docLinesMany, docWarehouses,
  returnIssue, vehicleIssueLines, type IssueLine } from '@/lib/piese';
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
  NO_MOVEMENT: 'Poziția nu are mișcare de stoc — nu se poate returna.',
  TOO_MUCH: 'Se returnează mai mult decât s-a eliberat.',
  TOO_OLD: 'Eliberarea e mai veche de 180 de zile — returul se face prin inventariere.',
  FIFO_MISMATCH: 'Nu am putut reconstitui straturile de cost. Anunță administratorul.',
};

// Codurile care descriu EXISTENȚA sau APARTENENȚA unei linii primesc toate același mesaj. Mesaje distincte
// ar fi răspuns, pentru un `line_id` ghicit, dacă linia există, dacă e a altui depozit și în ce stare e
// documentul — adică ar fi transformat butonul într-un instrument de cartografiat depozitele altora.
// Codurile rămân distincte în bază, pentru log-ul serverului. `NOT_ISSUE`/`NOT_CONFIRMED` sunt ridicate și
// de fluxul de ADĂUGARE (migr. 294), care are alt public — de aceea maparea e locală returului, nu globală.
const RETURN_OPAQUE = new Set(['NO_LINE', 'IS_RETURN', 'NOT_ISSUE', 'NOT_CONFIRMED', 'DOC_MISMATCH']);
const RETURN_OPAQUE_MSG = 'Poziția nu mai e disponibilă pentru retur. Reîncarcă lista.';

export async function checkIssue(warehouseId: number, vehicleId: number | null, partId: number) {
  const session = requireRole(await verifySession(), ...ISSUE_ROLES);
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: doar depozitul lui
  return issueAlert(warehouseId, vehicleId, partId);
}

// Avertismentele pentru MAI MULTE piese, într-o singură acțiune.
//
// De ce nu opt apeluri paralele: în App Router acțiunile de server se execută SECVENȚIAL — `Promise.all`
// peste ele nu le paralelizează, doar le pune la coadă. Cu opt rânduri pe ecran, o schimbare de mașină
// însemna opt dus-întors în serie, fiecare cu propria verificare de sesiune și de depozit, iar un click
// pe „Înregistrează" aștepta în spatele lor.
export async function checkIssueMany(warehouseId: number, vehicleId: number | null, partIds: number[]) {
  const session = requireRole(await verifySession(), ...ISSUE_ROLES);
  await assertWarehouseAllowed(session, warehouseId);
  const ids = Array.from(new Set(partIds.map(Number).filter((x) => Number.isInteger(x) && x > 0))).slice(0, MAX_LINES);
  const results = await Promise.all(ids.map((pid) => issueAlert(warehouseId, vehicleId, pid)));
  return Object.fromEntries(ids.map((pid, i) => [pid, results[i]]));
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
  const { rows, truncated } = await docLinesMany(docs.map((d) => d.id), false);
  return { id: docs[0].id, docCount: docs.length, positions: rows.length, lines: rows, truncated };
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

// Eliberările mașinii din care se mai poate returna ceva.
export async function loadVehicleIssues(warehouseId: number, vehicleId: number) {
  const session = requireRole(await verifySession(), ...ISSUE_ROLES);
  await assertWarehouseAllowed(session, warehouseId);
  return vehicleIssueLines(Number(warehouseId), Number(vehicleId));
}

/**
 * Retur de la lăcătuș. Piesa se întoarce în depozit, stingând straturile FIFO din care a plecat — deci și
 * cantitatea, și valoarea revin exact, fără să inventăm un strat nou la costul curent.
 *
 * `line_id` vine de la client, deci se verifică față de DOCUMENT (ca la adăugare): RPC-ul confruntă
 * depozitul ȘI mașina documentului cu cele pentru care apelantul a trecut de gardă. Fără verificarea
 * mașinii, un `line_id` rămas pe ecran ar fi putut corecta rashodul altei mașini din același depozit.
 *
 * `idem` e cheia clicului: dublu-clicul sau o retrimitere nu returnează piesa a doua oară.
 */
export async function submitReturn(payload: {
  warehouse_id: number; vehicle_id: number; line_id: number; qty: number; idem: string;
}) {
  const session = requireRole(await verifySession(), ...ISSUE_ROLES);
  await assertWarehouseAllowed(session, payload.warehouse_id);
  const qty = Number(payload.qty);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error(RPC_ERR.BAD_QTY);
  if (!Number.isInteger(Number(payload.line_id))) throw new Error(RETURN_OPAQUE_MSG);
  // Mașina se validează ca ÎNTREG POZITIV, nu doar se convertește: `Number(undefined)` dă NaN, care pleacă
  // spre bază ca `null`, iar `NULL IS DISTINCT FROM NULL` e fals — deci garda de mașină ar fi dispărut
  // exact pe rashodurile fără mașină (casare, consum general). Baza respinge acum și ea NULL-ul; asta e
  // al doilea strat, ca la `doc_id` după IDOR-ul din migr. 295.
  const vehicleId = Number(payload.vehicle_id);
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) throw new Error(RETURN_OPAQUE_MSG);
  const idem = String(payload.idem || '').slice(0, 64);
  if (!idem) throw new Error('Cerere invalidă.');

  let r: Awaited<ReturnType<typeof returnIssue>>;
  try {
    r = await returnIssue(Number(payload.line_id), Number(payload.warehouse_id), vehicleId, qty, idem);
  } catch (e: any) {
    const code = (e?.message || '').trim();
    if (RETURN_OPAQUE.has(code)) throw new Error(RETURN_OPAQUE_MSG);
    throw new Error(RPC_ERR[code] || 'Nu am putut înregistra returul. Reîncearcă.');
  }
  // ÎN AFARA try-ului: stocul s-a mișcat deja. Un eșec al urmei nu are voie să raporteze „reîncearcă",
  // fiindcă reîncercarea ar returna piesa a doua oară.
  // Reluarea aceluiași clic nu se consemnează: n-a fost un fapt nou, iar în urmă ar fi arătat ca două returi.
  if (!r.replay) {
    await auditWrite({
      adminId: session.id, action: 'RETURN_ISSUE', entity: 'issue', entityId: r.docId,
      after: {
        retur_din_pozitia: Number(payload.line_id), cantitate: r.qty,
        masina_id: vehicleId, valoare: r.value,
      },
    });
  }
  // Costul NU pleacă spre client dacă rolul n-are voie să-l vadă: un vânzător putea elibera o piesă și o
  // returna imediat — efect zero pe stoc — iar răspunsul îi spunea prețul de achiziție. Repetat pe catalog,
  // asta e lista de prețuri a furnizorilor. Ecranul nu afișează valoarea, dar ea circula pe rețea.
  return {
    ok: true, docId: r.docId, lineId: r.lineId, qty: r.qty, replay: r.replay,
    value: canSeeCost(session.role) ? r.value : null,
  };
}
