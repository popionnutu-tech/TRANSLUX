/**
 * POST /app/v1/vehicle { plate } — «+ Adaugă auto» din bot, pentru aplicație.
 * Creează mașina în nomenclator (direcția interurban); dacă placa există deja
 * (23505) întoarce mașina existentă din lista activă, ca report.ts în bot.
 */
import { createVehicle, getActiveVehicles } from '../services/db.js';
import { ApiError } from './errors.js';
import { normalizePlate } from './reportRules.js';

export interface VehicleResponse {
  id: string;
  plate_number: string;
  existed: boolean;
}

export async function postVehicle(rawBody: unknown): Promise<VehicleResponse> {
  const b = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : {};
  const plate = normalizePlate(b.plate);
  try {
    const v = await createVehicle(plate);
    return { id: v.id, plate_number: v.plate_number, existed: false };
  } catch (err: any) {
    if (err?.code !== '23505') throw err;
    const existing = (await getActiveVehicles()).find((v) => v.plate_number === plate);
    if (!existing) {
      throw new ApiError(409, 'VEHICLE_EXISTS', 'Acest număr există deja, dar nu e în lista activă — spune adminului');
    }
    return { id: existing.id, plate_number: existing.plate_number, existed: true };
  }
}
