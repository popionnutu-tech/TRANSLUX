import 'server-only';
import { getSupabase } from './supabase';

// Urma modificărilor: CINE a schimbat, CE era înainte și ce e după (migr. 291 + 292).
//
// Modul NEUTRU, nu parte din `piese`: îl folosesc și acțiunile de recepție, și cele de permisiuni din
// /users. Fără el, modulul „utilizatori" ar fi ajuns să importe din „piese" ca să-și scrie propria urmă.
//
// Starea se scrie STRUCTURAT (`before_data`/`after_data` jsonb), nu ca frază. Varianta cu text avea trei
// defecte, toate găsite la review: plafonul de caractere putea tăia tăcut tocmai câmpul important; un
// comentariu al utilizatorului putea fabrica în urmă o schimbare inexistentă; iar maparea manuală
// câmp-cu-câmp se strica în tăcere când cineva adăuga un câmp nou în antet.

export type AuditFields = Record<string, string | number | boolean | null>;

/** Perechea de stări reduse la CE s-a schimbat efectiv. `null` = nimic schimbat, deci nimic de scris. */
export function changedFields(
  before: AuditFields,
  after: AuditFields,
): { before: AuditFields; after: AuditFields } | null {
  const b: AuditFields = {}; const a: AuditFields = {};
  // Parcurgem reuniunea cheilor celor două obiecte primite. ATENȚIE: obiectele sunt construite manual de
  // apelant (vezi `auditHeaderChange`), deci un câmp nou adăugat în antet TOT trebuie trecut acolo —
  // funcția asta nu-l poate ghici. Ce s-a câștigat față de varianta cu frază e că nu se mai poate TĂIA
  // la plafon și nu se mai poate FABRICA prin separatori, nu că maparea ar fi dispărut.
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (after[k] === undefined) continue; // câmp netrimis = neatins, nu „golit"
    // `''` și `null` sunt aceeași absență: fără normalizare ar apărea rânduri fantomă „comentariu: — → —".
    const bv = before[k] === '' ? null : before[k] ?? null;
    const av = after[k] === '' ? null : after[k] ?? null;
    if (bv === av) continue;
    b[k] = bv; a[k] = av;
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

/**
 * Scrie un rând de urmă. NON-FATAL prin design: operațiunea de business a reușit deja și n-are rost s-o
 * dăm înapoi pentru un eșec al jurnalului — dar, spre deosebire de varianta tăcută, rămâne log pe server.
 *
 * `entityId` pentru documente (numeric), `subjectId` pentru restul (ex. uuid-ul unui cont). Tabelul are
 * `entity_id BIGINT` din istoric, de aceea uuid-urile stau separat în `subject_id` (migr. 292).
 */
export async function auditWrite(d: {
  adminId: string;
  /** Numele autorului la momentul faptei. Dacă lipsește, îl citim noi — dar apelanții care îl au îl dau. */
  actorLabel?: string | null;
  action: string;
  entity: string;
  entityId?: number | null;
  subjectId?: string | null;
  before?: AuditFields | null;
  after?: AuditFields | null;
  notes?: string;
}): Promise<void> {
  // Eticheta autorului se FOTOGRAFIAZĂ (migr. 293): `admin_accounts.name` e gol pentru majoritatea
  // conturilor, iar rezolvarea la citire ar fi făcut ca urma să depindă de starea curentă a contului —
  // deci s-ar fi schimbat la redenumire și s-ar fi pierdut la ștergere.
  const actor = d.actorLabel ?? (await actorLabelFor(d.adminId));
  const { error } = await getSupabase().from('piese_audit_log').insert({
    admin_id: d.adminId,
    actor_label: actor,
    action: d.action,
    entity: d.entity,
    entity_id: d.entityId ?? null,
    subject_id: d.subjectId ?? null,
    before_data: d.before ?? null,
    after_data: d.after ?? null,
    detail: d.notes ? d.notes.slice(0, 500) : null,
  });
  if (error) console.error('[audit] auditWrite:', error.message);
}

export interface AuditRow {
  at: string;
  action: string;
  who: string | null;
  /** Urma are un autor înregistrat? `false` = scrisă de motorul bazei (RPC), nu de un om. */
  hasActor: boolean;
  before: AuditFields | null;
  after: AuditFields | null;
  notes: string | null;
  docId: number | null; // pe ce document a fost scrisă urma (contează la lanțul de corecții)
}

// Eticheta unui cont pentru jurnal. `name`, dacă există; altfel partea dinaintea lui @ din email —
// NU emailul întreg, care e identificatorul de login. Pentru „admin@translux.md" iese „admin", adică
// exact cum îi spun oamenii între ei, fără să publice credențialul.
async function actorLabelFor(adminId: string): Promise<string | null> {
  const { data } = await getSupabase().from('admin_accounts').select('name, email').eq('id', adminId).maybeSingle();
  const a = data as { name: string | null; email: string | null } | null;
  if (!a) return null;
  return a.name || (a.email ? a.email.split('@')[0] : null);
}

// Etichetele pentru rândurile VECHI, scrise înainte de migr. 293 (fără `actor_label`).
async function resolveActors(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data, error } = await getSupabase().from('admin_accounts').select('id, name, email').in('id', ids);
  // Aruncă: „n-am putut afla cine" nu are voie să arate ca „nu se știe cine" — vezi comentariul de la citire.
  if (error) throw new Error('Nu am putut identifica autorii modificărilor');
  for (const a of ((data as { id: string; name: string | null; email: string | null }[]) || [])) {
    const label = a.name || (a.email ? a.email.split('@')[0] : null);
    if (label) names.set(a.id, label);
  }
  return names;
}

/**
 * Istoricul unui DOCUMENT, urmărind lanțul de corecții.
 *
 * O corecție de linii nu modifică documentul: îl anulează și creează unul nou. Urmele scrise înainte
 * rămân agățate de id-ul vechi, iar acela dispare din liste (`status = CANCELLED`). Fără urmărirea
 * lanțului, istoricul unei schimbări de furnizor ar deveni invizibil imediat ce cineva corectează
 * o cantitate — adică exact atunci când contează mai mult.
 */
const HISTORY_LIMIT = 100;

export async function auditHistoryForDoc(
  entity: string, docId: number, maxDepth = 10,
): Promise<{ rows: AuditRow[]; partial: boolean }> {
  const ids: number[] = [];
  let cur: number | null = Number(docId);
  let depthHit = false;
  for (let i = 0; ; i++) {
    if (cur == null) break;
    if (i >= maxDepth) { depthHit = true; break; } // lanț mai lung decât citim → istoric parțial, și o spunem
    ids.push(cur);
    // Documentul curent a apărut dintr-o corecție? Atunci predecesorul lui poartă restul urmei.
    // `.order` explicit: fără el, „primul" rând ar fi arbitrar dacă ar exista vreodată două verigi.
    // Tipare explicită: fără ea, TS nu poate infera printr-o variabilă folosită în propria buclă.
    const linkRes = await getSupabase().from('piese_audit_log')
      .select('before_data').eq('entity', entity).eq('entity_id', cur)
      .not('before_data->>replaces_doc_id', 'is', null)
      .order('created_at', { ascending: true }).limit(1);
    const eLink = linkRes.error;
    const link = linkRes.data as { before_data: AuditFields | null }[] | null;
    // Eroarea NU se înghite: altfel lanțul s-ar opri tăcut, iar ecranul ar arăta un istoric incomplet
    // ca și cum ar fi complet — exact confuzia pe care restul funcției o interzice.
    if (eLink) throw new Error('Nu am putut urmări lanțul de corecții');
    const prev: unknown = (link || [])[0]?.before_data?.replaces_doc_id;
    const prevNum = Number(prev);
    cur = prev == null || !Number.isFinite(prevNum) ? null : prevNum;
    if (cur != null && ids.includes(cur)) break; // gardă contra unui lanț circular
  }

  const { data, error } = await getSupabase().from('piese_audit_log')
    .select('created_at, action, detail, admin_id, actor_label, before_data, after_data, entity_id')
    .eq('entity', entity).in('entity_id', ids)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(HISTORY_LIMIT + 1);
  // Aruncăm: „n-am putut citi urma" nu are voie să arate la fel ca „documentul n-a fost modificat".
  if (error) throw new Error('Nu am putut încărca istoricul modificărilor');

  const all = (data as any[]) || [];
  const rows = all.slice(0, HISTORY_LIMIT);
  return { rows: await toAuditRows(rows), partial: depthHit || all.length > HISTORY_LIMIT };
}

// Rândurile vechi (dinainte de migr. 293) n-au etichetă fotografiată — pentru ele o rezolvăm acum.
async function toAuditRows(rows: any[]): Promise<AuditRow[]> {
  const needLookup = rows.filter((r) => r.admin_id && !r.actor_label).map((r) => r.admin_id);
  const names = await resolveActors(Array.from(new Set(needLookup)));
  return rows.map((r) => ({
    at: r.created_at as string,
    action: r.action as string,
    who: (r.actor_label as string) || (r.admin_id ? names.get(r.admin_id) || null : null),
    hasActor: !!r.admin_id,
    before: (r.before_data as AuditFields) || null,
    after: (r.after_data as AuditFields) || null,
    notes: (r.detail as string) || null,
    docId: r.entity_id == null ? null : Number(r.entity_id),
  }));
}

/** Istoricul unui SUBIECT non-numeric (ex. un cont administrativ, identificat prin uuid). */
export async function auditHistoryForSubject(
  entity: string, subjectId: string,
): Promise<{ rows: AuditRow[]; partial: boolean }> {
  const { data, error } = await getSupabase().from('piese_audit_log')
    .select('created_at, action, detail, admin_id, actor_label, before_data, after_data')
    .eq('entity', entity).eq('subject_id', subjectId)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(HISTORY_LIMIT + 1);
  if (error) throw new Error('Nu am putut încărca istoricul');
  const all = (data as any[]) || [];
  const rows = all.slice(0, HISTORY_LIMIT).map((r) => ({ ...r, entity_id: null }));
  return { rows: await toAuditRows(rows), partial: all.length > HISTORY_LIMIT };
}
