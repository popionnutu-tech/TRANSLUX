'use server';

import { verifySession, type Session } from '@/lib/auth';
import {
  uzineCuSablon, listSaptamana, atribuieMulti, confirmaManual,
  vehiclesForPicker, soferiForPicker, titularForVehicle, chisinauToday,
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

export async function salveazaMulti(p: AtribuieMultiParams) {
  const s = await requireUzineRole();
  return atribuieMulti(p, null, s.id);
}

export async function confirmaManualAdmin(rowId: string) {
  const s = await requireUzineRole();
  await confirmaManual(rowId, null, s.id);
}

export type { AtribuireView };
