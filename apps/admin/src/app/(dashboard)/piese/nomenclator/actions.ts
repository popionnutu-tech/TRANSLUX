'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { auditWrite, changedFields, type AuditFields } from '@/lib/audit';
import { LOOKUP_ADMIN_ROLES } from '@/lib/piese-access';
import type { AdminRole } from '@translux/db';
import {
  createWarehouse, updateWarehouse,
  createGroup, updateGroup,
  createSupplier, updateSupplier,
  createClient, updateClient,
  createMechanic, updateMechanic,
  createReason, updateReason,
  listLookupAdmin, renameLookup, setLookupActive, lookupSnapshot, type LookupKind,
} from '@/lib/piese-nomenclator';

// Autorizare centralizată pe secțiune (single source of truth pentru drepturile de editare nomenclator).
// `entity`/`table`/`audit` alimentează urma din jurnal (migr. 338). Lista de câmpuri e ALBĂ, nu `*`:
// o coloană adăugată mâine n-are voie să ajungă în jurnal fără ca cineva să fi decis asta.
//
// Grupa poartă `markup_pct` — adaosul care stabilește prețul de raft pentru TOATE piesele din categorie.
// Până acum se putea schimba fără să rămână nicio urmă nicăieri; e chiar lucrul pe care Mariana voia să-l
// poată verifica.
type Handler = {
  roles: AdminRole[]; create: (d: any) => Promise<void>; update: (id: number, d: any) => Promise<void>;
  entity: string; table: string; audit: string[];
};
const HANDLERS: Record<string, Handler> = {
  warehouses: { roles: ['ADMIN'], create: createWarehouse, update: updateWarehouse,
    entity: 'warehouse', table: 'piese_warehouses', audit: ['code', 'name', 'kind'] },
  groups: { roles: ['ADMIN', 'DEPOZITAR', 'GESTIONAR'], create: createGroup, update: updateGroup,
    entity: 'part_group', table: 'piese_part_groups', audit: ['name_ro', 'name_ru', 'markup_pct', 'norm_km'] },
  suppliers: { roles: ['ADMIN', 'DEPOZITAR', 'GESTIONAR'], create: createSupplier, update: updateSupplier,
    entity: 'supplier', table: 'piese_suppliers', audit: ['name', 'idno', 'contact'] },
  clients: { roles: ['ADMIN', 'VINZATOR', 'GESTIONAR'], create: createClient, update: updateClient,
    entity: 'client', table: 'piese_clients', audit: ['name', 'idno', 'bank', 'address'] },
  mechanics: { roles: ['ADMIN', 'VINZATOR', 'GESTIONAR'], create: createMechanic, update: updateMechanic,
    entity: 'mechanic', table: 'piese_mechanics', audit: ['name'] },
  reasons: { roles: ['ADMIN', 'VINZATOR', 'GESTIONAR'], create: createReason, update: updateReason,
    entity: 'reason', table: 'piese_breakdown_reasons', audit: ['name', 'category'] },
};

export async function createNomenclator(section: string, data: Record<string, unknown>) {
  const h = HANDLERS[section];
  if (!h) throw new Error('Secțiune invalidă');
  const session = requireRole(await verifySession(), ...h.roles);
  await h.create(data);
  // ÎN AFARA oricărui try: rândul s-a scris deja. Fără `entityId` — `create` nu întoarce id-ul, iar o
  // urmă fără id e tot mai bună decât nicio urmă.
  await auditWrite({
    adminId: session.id, action: 'CREATE', entity: h.entity,
    after: pick(data, h.audit),
  });
  revalidatePath('/piese/nomenclator');
  return { ok: true };
}

// Doar câmpurile din lista albă, aduse la scalari — `AuditFields` nu ține obiecte.
function pick(d: Record<string, unknown>, fields: string[]): AuditFields {
  const out: AuditFields = {};
  for (const k of fields) {
    const v = d[k];
    // Câmpul NETRIMIS rămâne în afara comparației. `changedFields` sare peste cheile absente, dar dacă le-am
    // transforma aici în `null` ar apărea ca „schimbat în gol" — iar formularul de piesă nu trimite `active`,
    // deci fiecare salvare ar fi raportat o dezactivare care nu s-a întâmplat.
    if (v === undefined) continue;
    out[k] = v === null || v === '' ? null
      : typeof v === 'number' || typeof v === 'boolean' ? v : String(v);
  }
  return out;
}

export async function updateNomenclator(section: string, id: number, data: Record<string, unknown>) {
  const h = HANDLERS[section];
  if (!h) throw new Error('Secțiune invalidă');
  if (!id || id <= 0) throw new Error('ID invalid');
  const session = requireRole(await verifySession(), ...h.roles);
  // Starea dinainte se citește ÎNAINTE de scriere — altfel n-ar mai avea de unde.
  const before = await lookupSnapshot(h.table, id, h.audit);
  await h.update(id, data);
  const diff = before ? changedFields(before, pick(data, h.audit)) : null;
  // Se scrie doar dacă S-A schimbat ceva: cine deschide formularul și apasă „Salvează" fără să atingă
  // nimic n-are ce căuta în jurnal — altfel urmele reale s-ar îneca în zgomot.
  if (diff) {
    await auditWrite({
      adminId: session.id, action: 'EDIT', entity: h.entity, entityId: id,
      before: diff.before, after: diff.after,
    });
  }
  revalidatePath('/piese/nomenclator');
  return { ok: true };
}

// ── Administrarea nomenclatoarelor de producători / mărci (migr. 317) ──
// Doar ADMIN. Redenumirea MUTĂ piesele — e o operațiune în masă asupra catalogului, nu o editare de rând;
// adăugarea unei valori noi rămâne deschisă tuturor celor care pot scrie o piesă (`addPartLookup`).
// Rolurile vin din `piese-access` — aceeași listă pe care o citește și pagina când decide ce taburi
// randează. Cu două constante separate, tabul s-ar fi putut randa pentru un rol care apoi primea
// „Acces interzis" la fiecare clic: ecran rupt în loc de ecran ascuns.
const KINDS = new Set(['manufacturer', 'carModel']);

function cleanKind(kind: string): LookupKind {
  if (!KINDS.has(kind)) throw new Error('Nomenclator invalid');
  return kind as LookupKind;
}

export async function loadLookupAdmin(kind: string) {
  requireRole(await verifySession(), ...LOOKUP_ADMIN_ROLES);
  return listLookupAdmin(cleanKind(kind));
}

export async function renameLookupEntry(kind: string, id: number, newName: string) {
  const session = requireRole(await verifySession(), ...LOOKUP_ADMIN_ROLES);
  const k = cleanKind(kind);
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('Intrare invalidă');
  const r = await renameLookup(k, Number(id), String(newName ?? ''));
  // ÎN AFARA unui try: redenumirea s-a comis deja. Un eșec al urmei n-are voie să raporteze eșec,
  // fiindcă reîncercarea ar redenumi altceva (numele vechi nu mai există).
  await auditWrite({
    adminId: session.id, action: r.merged ? 'MERGE' : 'RENAME', entity: 'piese_lookup',
    subjectId: `${k}:${id}`, before: { denumire: r.old }, after: { denumire: r.next, piese_mutate: r.moved },
  });
  // La contopire se scrie o urmă ȘI pe intrarea SUPRAVIEȚUITOARE: prima are `subjectId` al rândului care
  // tocmai a fost șters, deci cine se întreabă „de ce are TRW brusc 16 piese?" n-ar avea de unde porni.
  if (r.merged && r.targetId != null) {
    await auditWrite({
      adminId: session.id, action: 'MERGE_IN', entity: 'piese_lookup',
      subjectId: `${k}:${r.targetId}`,
      after: { a_absorbit: r.old, piese_primite: r.moved, denumire: r.next },
    });
  }
  revalidatePath('/piese/nomenclator');
  revalidatePath('/piese/stoc');
  return r;
}

export async function toggleLookupActive(kind: string, id: number, active: boolean) {
  const session = requireRole(await verifySession(), ...LOOKUP_ADMIN_ROLES);
  const k = cleanKind(kind);
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('Intrare invalidă');
  await setLookupActive(k, Number(id), active === true);
  await auditWrite({
    adminId: session.id, action: active ? 'ACTIVATE' : 'DEACTIVATE', entity: 'piese_lookup',
    subjectId: `${k}:${id}`, after: { activ: active === true },
  });
  revalidatePath('/piese/nomenclator');
  return { ok: true };
}
