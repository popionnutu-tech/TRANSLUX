'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed, PART_WRITE_ROLES } from '@/lib/piese-access';
import { getCountSheet, submitInventory } from '@/lib/piese-ops';
import { warehouseLayout, createInitialReceipt, partStock, recostPart } from '@/lib/piese';
import { setPartLocationsBulk, ensureSupplierByName } from '@/lib/piese-nomenclator';

export async function loadSheet(warehouseId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'VINZATOR', 'GESTIONAR');
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: doar depozitul lui
  return getCountSheet(warehouseId);
}
export async function saveInventory(warehouseId: number, counts: { part_id: number; counted_qty: number }[]) {
  const session = requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'VINZATOR', 'GESTIONAR');
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: nu poate inventaria alt depozit
  return submitInventory(warehouseId, counts);
}

// ── Inventar „de la zero" (greenfield): pornirea unui depozit gol dintr-un singur ecran ──
// Pilotul Marcel la MAGAZIN: scanează/caută piesa → pune cantitatea faptică + locația (SECȚIE-RAFT-POLIȚĂ).
// Gardă: rolurile care SCRIU LOCAȚII (PART_WRITE_ROLES = ADMIN/DEPOZITAR/GESTIONAR, NU VINZATOR — vânzătorul
// are inventarul clasic de numărare, nu pornirea) + contul legat de depozitul lui (assertWarehouseAllowed).

// Harta rafturilor curentă a unui depozit — pentru afișarea live sub foaie (la schimbarea depozitului).
export async function loadLayout(warehouseId: number) {
  const session = requireRole(await verifySession(), ...PART_WRITE_ROLES);
  await assertWarehouseAllowed(session, warehouseId);
  return warehouseLayout(warehouseId);
}

// Pornirea unui depozit gol, cu COST OPȚIONAL per piesă:
//  • piesa CU cost → intră ca RECEPȚIE FIFO prin furnizorul fictiv „SOLD INIȚIAL" → valoare/profit corecte;
//  • piesa FĂRĂ cost → doc INVENTORY (current=0 → ADJUST_PLUS la cost 0; costul real vine din Prihod / Revizuire cost).
// Plus fixarea locației în piese_part_locations (Harta rafturilor + alertele „de comandat").
// ATENȚIE (semantică): recepția ADAUGĂ stoc (nu setează) → corect la pornirea de la 0, dar re-introducerea aceleiași
// piese CU cost ar dubla stocul. De aceea: dedup în-save + recepția e ULTIMA scriere + citirea hărții de după e
// protejată, ca un eșec ulterior să nu poată dubla recepția la un retry. Corecțiile de cost ulterioare = „Revizuire cost".
export async function saveInitialInventory(
  warehouseId: number,
  rows: { part_id: number; counted_qty: number; location_label?: string; unit_cost?: number }[],
  idemKey: string,
) {
  const session = requireRole(await verifySession(), ...PART_WRITE_ROLES);
  await assertWarehouseAllowed(session, warehouseId);

  // Dedup pe part_id (ultima intrare câștigă), doar cantități > 0. Cost >0 ⇒ recepție FIFO; altfel 0 ⇒ inventar.
  const byPart = new Map<number, { part_id: number; counted_qty: number; location_label?: string; unit_cost: number }>();
  for (const r of rows) {
    const pid = Number(r.part_id);
    const qty = Number(r.counted_qty);
    if (!pid || !(qty > 0)) continue;
    const cost = Number(r.unit_cost);
    byPart.set(pid, { part_id: pid, counted_qty: qty, location_label: r.location_label, unit_cost: cost > 0 ? cost : 0 });
  }
  const clean = Array.from(byPart.values());
  if (!clean.length) throw new Error('Nicio poziție validă (piesă + cantitate > 0).');

  // Validare ușoară de format ÎNAINTE de a scrie ceva: măcar SECȚIE-RAFT (un „-"), ca harta să nu se deformeze
  // din intrări gen „raft 5". Permite A-12-3, A-12 etc.; nu blocăm formate mai bogate. Eticheta goală e permisă.
  const badLoc = clean
    .map((r) => (r.location_label || '').trim())
    .filter((l) => l && !/^[^-]+-[^-]+/.test(l));
  if (badLoc.length) {
    throw new Error(`Locație în format greșit (folosește SECȚIE-RAFT-POLIȚĂ, ex. A-12-3): ${badLoc.slice(0, 3).join(', ')}${badLoc.length > 3 ? '…' : ''}`);
  }

  const withCost = clean.filter((r) => r.unit_cost > 0);
  const noCost = clean.filter((r) => r.unit_cost <= 0);

  // ORDINE SIGURĂ LA RE-SALVARE: pașii idempotenți întâi, recepția (singura care ADAUGĂ) ULTIMA.
  // (1) Stoc fără cost — inventar (set-to-counted, idempotent).
  let diffs = 0;
  if (noCost.length) {
    const inv = await submitInventory(warehouseId, noCost.map((r) => ({ part_id: r.part_id, counted_qty: r.counted_qty })));
    diffs = inv.diffs;
  }
  // (2) Locații — upsert în masă (idempotent). Dacă pică, aruncă ÎNAINTE de recepție → retry sigur.
  const placed = await setPartLocationsBulk(warehouseId, clean.map((r) => ({ part_id: r.part_id, location_label: (r.location_label || '').trim() })));
  // (3) Stoc cu cost — RECEPȚIE FIFO prin „SOLD INIȚIAL" (ULTIMA scriere). IDEMPOTENTĂ pe idemKey: un retry
  // după o recepție deja comisă (pană de rețea) e respins de indexul unic (migr. 235) → nu se dublează stocul.
  let received = 0;
  let alreadyReceived = false;
  if (withCost.length) {
    if (!idemKey) throw new Error('Lipsește cheia de idempotență pentru recepția cu cost.');
    const supplierId = await ensureSupplierByName('SOLD INIȚIAL');
    const r = await createInitialReceipt({
      warehouse_id: warehouseId, supplier_id: supplierId, idem_key: idemKey,
      lines: withCost.map((r) => ({ part_id: r.part_id, qty: r.counted_qty, unit_cost: r.unit_cost })),
    });
    if (r.duplicate) alreadyReceived = true; else received = withCost.length;
  }

  revalidatePath('/piese/harta');
  revalidatePath('/piese/stoc');
  // Citirea hărții e protejată: dacă pică după o recepție reușită, NU aruncăm (altfel retry-ul ar dubla recepția).
  let layout: unknown = null;
  try { layout = await warehouseLayout(warehouseId); } catch { layout = null; }
  return { saved: clean.length, received, alreadyReceived, diffs, placed, layout };
}

// ── 2B: Revizuire cost (fără schimbarea cantității) ──
// Citește stocul + costul mediu curent al unei piese într-un depozit (pentru ecranul de revizuire).
export async function loadPartStock(warehouseId: number, partId: number) {
  const session = requireRole(await verifySession(), ...PART_WRITE_ROLES);
  await assertWarehouseAllowed(session, warehouseId);
  return partStock(warehouseId, partId);
}
// Aplică costul nou (RPC piese_recost): scoate stocul la costul vechi + îl readuce la cel nou, net qty 0.
export async function recostPartAction(warehouseId: number, partId: number, newCost: number) {
  const session = requireRole(await verifySession(), ...PART_WRITE_ROLES);
  await assertWarehouseAllowed(session, warehouseId);
  const res = await recostPart(warehouseId, partId, newCost);
  revalidatePath('/piese/stoc');
  revalidatePath('/piese/harta');
  return res;
}
