// Helpers client pentru Mini App-ul de atribuiri — refolosim paleta/initData din zadachnik.
export { C, initData, ready } from '../zadachnik/ui';
import { initData as _initData } from '../zadachnik/ui';

export async function api(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch('/api/atribuiri' + path, {
    ...opts,
    headers: { 'x-telegram-init-data': _initData(), 'content-type': 'application/json', ...(opts.headers || {}) },
  });
}

export interface AtribuireView {
  id: string;
  date: string;
  direction: string;
  route_kind: 'uzina' | 'interurban' | 'suburban';
  factory_route_id: string | null;
  shift_number: number | null;
  crm_route_id: number | null;
  vehicle_id: string | null;
  driver_id: string | null;
  status: string;
  verification_note: string | null;
  route_key: string;
  route_label: string;
  plate: string | null;
  driver_name: string | null;
  foaie: string | null;
  template_vehicle_id: string | null;
}

export interface PickerVehicle { id: string; plate: string; inDirection: boolean }
export interface PickerSofer { id: string; name: string; inDirection: boolean }

/** Nume scurt pentru chip: «Ion Popescu» → «Popescu I.» */
export function shortName(full: string | null): string {
  if (!full) return '';
  const p = full.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0];
}

export const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  planificat: { label: 'planificat', color: '#8a7f86' },
  modificat_proactiv: { label: 'modificat', color: '#c07a12' },
  modificat_reactiv: { label: 'corectat', color: '#c07a12' },
  confirmat_auto: { label: 'confirmat GPS', color: '#1a8a4a' },
  confirmat_manual: { label: 'confirmat manual', color: '#1a8a4a' },
  nepotrivire: { label: 'nepotrivire', color: '#c0392b' },
  fara_date_gps: { label: 'fără GPS', color: '#8a7f86' },
};

/** Azi/Mâine în Chișinău, YYYY-MM-DD (client). */
export function chisinauDay(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
