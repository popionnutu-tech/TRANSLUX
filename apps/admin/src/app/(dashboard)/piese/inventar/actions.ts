'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed, PART_WRITE_ROLES } from '@/lib/piese-access';
import { getCountSheet, submitInventory } from '@/lib/piese-ops';
import { warehouseLayout } from '@/lib/piese';
import { setPartLocationsBulk } from '@/lib/piese-nomenclator';

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

// Face DOUĂ lucruri pe rând (fiecare pas idempotent): (1) aduce stocul la cantitatea numărată printr-un
// doc INVENTORY — piesă fără mișcări: current=0 → ADJUST_PLUS la cost 0 (costul real vine din Prihod);
// (2) fixează locația în piese_part_locations → alimentează Harta rafturilor + alertele „de comandat".
export async function saveInitialInventory(
  warehouseId: number,
  rows: { part_id: number; counted_qty: number; location_label?: string }[],
) {
  const session = requireRole(await verifySession(), ...PART_WRITE_ROLES);
  await assertWarehouseAllowed(session, warehouseId);

  // Dedup pe part_id (UNIQUE(part_id,warehouse_id) pe locație; ultima intrare câștigă), doar cantități > 0.
  const byPart = new Map<number, { part_id: number; counted_qty: number; location_label?: string }>();
  for (const r of rows) {
    const pid = Number(r.part_id);
    const qty = Number(r.counted_qty);
    if (!pid || !(qty > 0)) continue;
    byPart.set(pid, { part_id: pid, counted_qty: qty, location_label: r.location_label });
  }
  const clean = Array.from(byPart.values());
  if (!clean.length) throw new Error('Nicio poziție validă (piesă + cantitate > 0).');

  // Validare ușoară de format ÎNAINTE de a scrie ceva (acesta e locul unde se introduc în masă locațiile la
  // pornirea depozitului): măcar SECȚIE-RAFT (un „-"), ca harta să nu se deformeze din intrări gen „raft 5".
  // Permite A-12-3, A-12 etc.; nu blocăm formate mai bogate. Eticheta goală e permisă (piesă fără loc încă).
  const badLoc = clean
    .map((r) => (r.location_label || '').trim())
    .filter((l) => l && !/^[^-]+-[^-]+/.test(l));
  if (badLoc.length) {
    throw new Error(`Locație în format greșit (folosește SECȚIE-RAFT-POLIȚĂ, ex. A-12-3): ${badLoc.slice(0, 3).join(', ')}${badLoc.length > 3 ? '…' : ''}`);
  }

  // (1) Stoc — un singur doc INVENTORY pentru toate piesele. Atomic; dacă pică, nu s-a scris nimic.
  const inv = await submitInventory(warehouseId, clean.map((r) => ({ part_id: r.part_id, counted_qty: r.counted_qty })));

  // (2) Locații — un SINGUR upsert în masă (doar etichete ne-goale). Stocul (pasul 1) e deja comis; dacă
  // upsert-ul de locații pică, raportăm succes-PARȚIAL (stoc salvat, locații nefixate) în loc să aruncăm și
  // să-l lăsăm pe operator să creadă că „n-a mers" — reîncercarea doar a locațiilor e sigură (idempotentă).
  let placed = 0;
  let locationError: string | null = null;
  try {
    placed = await setPartLocationsBulk(warehouseId, clean.map((r) => ({ part_id: r.part_id, location_label: (r.location_label || '').trim() })));
  } catch (e) {
    locationError = e instanceof Error ? e.message : 'Locațiile nu s-au putut fixa';
  }

  revalidatePath('/piese/harta');
  revalidatePath('/piese/stoc');
  return { saved: clean.length, diffs: inv.diffs, placed, locationError, layout: await warehouseLayout(warehouseId) };
}
