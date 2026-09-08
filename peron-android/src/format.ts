/** Funcții pure de afișare (fără React, ușor de testat). */
import type { PointEnum } from './types';

/** 'YYYY-MM-DD' → 'DD.MM.YYYY'. Alt format se întoarce neschimbat. */
export function formatDateRo(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : date;
}

export function pointLabel(point: PointEnum): string {
  return point === 'BALTI' ? 'Bălți' : 'Chișinău';
}

/** 'HH:MM' al momentului dat, ora locală a telefonului (fusul Chișinăului pe telefoanele operatorilor). */
export function localHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' local al momentului dat. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Distanța (m) între două coordonate — aceeași formulă ca `haversineDistance` din bot. */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
