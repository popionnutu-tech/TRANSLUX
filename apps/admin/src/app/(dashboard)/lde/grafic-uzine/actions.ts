'use server';

import { verifySession, type Session } from '@/lib/auth';
import {
  uzineCuSablon, listSaptamana, atribuieMulti, confirmaManual,
  vehiclesForPicker, soferiForPicker, titularForVehicle, chisinauToday,
  uzinaOfRoute, rowScope, adaugaDubla, stergeDubla,
  type AtribuieMultiParams, type AtribuireView,
} from '@/lib/atribuiri/core';
import { weekDates } from '@/lib/atribuiri/saptamana';

// Server actions pentru grila săptămânală de uzine. Rolul UZINE (Alexei) e închis
// pe pagina asta din middleware; aici doar re-verificăm sesiunea + rolul.

async function requireUzineRole(): Promise<Session> {
  const s = await verifySession();
  if (!s || (s.role !== 'ADMIN' && s.role !== 'UZINE')) throw new Error('Neautorizat');
  return s;
}

export async function getUzineTabs() {
  await requireUzineRole();
  return uzineCuSablon(); // {id, label}[] — doar active + has_weekly_template (fără Trox)
}

export async function getSaptamana(uzinaId: string) {
  await requireUzineRole();
  const today = chisinauToday();
  const dates = weekDates(today);
  const rows = await listSaptamana(uzinaId, dates);
  return { today, dates, rows };
}

export async function getPickers(uzinaId: string) {
  await requireUzineRole();
  const [vehicles, soferi] = await Promise.all([vehiclesForPicker(uzinaId), soferiForPicker(uzinaId)]);
  return { vehicles, soferi };
}

export async function getTitularId(vehicleId: string, shiftNumber: number) {
  await requireUzineRole();
  return titularForVehicle(vehicleId, shiftNumber);
}

// Next.js maschează mesajele de eroare aruncate din 'use server' în producție — acțiunile
// întorc explicit { error } în loc să arunce, ca UI-ul să poată afișa mesajul real.
export async function salveazaMulti(p: AtribuieMultiParams): Promise<{ updated: number; skipped: number } | { error: string }> {
  try {
    const s = await requireUzineRole();
    // scope: chiar dacă middleware/pagina închid rolul UZINE pe grafic-uzine, ruta trebuie
    // să fie a unei uzine cu șablon (nu Trox/interurban/suburban strecurate printr-un id valid)
    const uzina = await uzinaOfRoute(p.factoryRouteId);
    const permise = (await uzineCuSablon()).map((u) => u.id);
    if (!uzina || !permise.includes(uzina)) return { error: 'Uzină neautorizată' };
    return await atribuieMulti(p, null, s.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Eroare' };
  }
}

export async function confirmaManualAdmin(rowId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const s = await requireUzineRole();
    const scope = await rowScope(rowId);
    const permise = (await uzineCuSablon()).map((u) => u.id);
    if (!scope || scope.route_kind !== 'uzina' || !permise.includes(scope.direction)) {
      return { error: 'Rând neautorizat' };
    }
    await confirmaManual(rowId, null, s.id);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Eroare' };
  }
}

// scope comun pentru dubluri: ruta trebuie să fie a unei uzine cu șablon
async function rutaAutorizata(factoryRouteId: string): Promise<string | null> {
  const uzina = await uzinaOfRoute(factoryRouteId);
  const permise = (await uzineCuSablon()).map((u) => u.id);
  return uzina && permise.includes(uzina) ? uzina : null;
}

export async function addDublaAdmin(factoryRouteId: string, shiftNumber: number): Promise<{ slot: number } | { error: string }> {
  try {
    const s = await requireUzineRole();
    if (!(await rutaAutorizata(factoryRouteId))) return { error: 'Uzină neautorizată' };
    return await adaugaDubla(factoryRouteId, shiftNumber, null, s.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Eroare' };
  }
}

export async function stergeDublaAdmin(factoryRouteId: string, shiftNumber: number, slot: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireUzineRole();
    if (!(await rutaAutorizata(factoryRouteId))) return { error: 'Uzină neautorizată' };
    await stergeDubla(factoryRouteId, shiftNumber, slot);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Eroare' };
  }
}

export type { AtribuireView };
