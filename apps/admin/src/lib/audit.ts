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
  // Parcurgem reuniunea cheilor: un câmp adăugat mai târziu în antet intră automat în urmă,
  // fără să fie nevoie ca cineva să-l treacă într-o listă (locul unde varianta veche se strica tăcut).
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (after[k] === undefined) continue; // câmp netrimis = neatins, nu „golit"
    if (before[k] === after[k]) continue;
    b[k] = before[k] ?? null; a[k] = after[k] ?? null;
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
  action: string;
  entity: string;
  entityId?: number | null;
  subjectId?: string | null;
  before?: AuditFields | null;
  after?: AuditFields | null;
  notes?: string;
}): Promise<void> {
  const { error } = await getSupabase().from('piese_audit_log').insert({
    admin_id: d.adminId,
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
  before: AuditFields | null;
  after: AuditFields | null;
  notes: string | null;
  docId: number | null; // pe ce document a fost scrisă urma (contează la lanțul de corecții)
}

// Rezolvă numele conturilor. DOAR `name` — emailul e identificatorul de login și n-are ce căuta
// într-un ecran deschis de depozitar (restul aplicației expune tot doar numele).
async function resolveActors(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data } = await getSupabase().from('admin_accounts').select('id, name').in('id', ids);
  for (const a of ((data as { id: string; name: string | null }[]) || [])) {
    if (a.name) names.set(a.id, a.name);
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
export async function auditHistoryForDoc(entity: string, docId: number, maxDepth = 10): Promise<AuditRow[]> {
  const ids: number[] = [];
  let cur: number | null = Number(docId);
  for (let i = 0; i < maxDepth && cur != null; i++) {
    ids.push(cur);
    // Documentul curent a apărut dintr-o corecție? Atunci predecesorul lui poartă restul urmei.
    const res: { data: { before_data: AuditFields | null }[] | null } = await getSupabase()
      .from('piese_audit_log')
      .select('before_data').eq('entity', entity).eq('entity_id', cur)
      .not('before_data->>replaces_doc_id', 'is', null).limit(1);
    const prev = (res.data || [])[0]?.before_data?.replaces_doc_id;
    cur = prev == null ? null : Number(prev);
    if (cur != null && ids.includes(cur)) break; // gardă contra unui lanț circular
  }

  const { data, error } = await getSupabase().from('piese_audit_log')
    .select('created_at, action, detail, admin_id, before_data, after_data, entity_id')
    .eq('entity', entity).in('entity_id', ids)
    .order('created_at', { ascending: false }).limit(100);
  // Aruncăm: „n-am putut citi urma" nu are voie să arate la fel ca „documentul n-a fost modificat".
  if (error) throw new Error('Nu am putut încărca istoricul modificărilor');

  const rows = (data as any[]) || [];
  const names = await resolveActors(Array.from(new Set(rows.map((r) => r.admin_id).filter(Boolean))));
  return rows.map((r) => ({
    at: r.created_at as string,
    action: r.action as string,
    who: r.admin_id ? (names.get(r.admin_id) || null) : null,
    before: (r.before_data as AuditFields) || null,
    after: (r.after_data as AuditFields) || null,
    notes: (r.detail as string) || null,
    docId: r.entity_id == null ? null : Number(r.entity_id),
  }));
}

/** Istoricul unui SUBIECT non-numeric (ex. un cont administrativ, identificat prin uuid). */
export async function auditHistoryForSubject(entity: string, subjectId: string): Promise<AuditRow[]> {
  const { data, error } = await getSupabase().from('piese_audit_log')
    .select('created_at, action, detail, admin_id, before_data, after_data')
    .eq('entity', entity).eq('subject_id', subjectId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error('Nu am putut încărca istoricul');
  const rows = (data as any[]) || [];
  const names = await resolveActors(Array.from(new Set(rows.map((r) => r.admin_id).filter(Boolean))));
  return rows.map((r) => ({
    at: r.created_at as string,
    action: r.action as string,
    who: r.admin_id ? (names.get(r.admin_id) || null) : null,
    before: (r.before_data as AuditFields) || null,
    after: (r.after_data as AuditFields) || null,
    notes: (r.detail as string) || null,
    docId: null,
  }));
}
