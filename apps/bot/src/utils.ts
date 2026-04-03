import { randomBytes } from 'crypto';
import { config } from './config.js';

/** Get today's date string (YYYY-MM-DD) in Europe/Chisinau timezone */
export function getTodayDate(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: config.timezone });
}

/** Format time from HH:MM:SS to HH:MM */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

/** Format date from YYYY-MM-DD to DD.MM.YYYY */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

/** Generate a cryptographically secure invite token */
export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Chunk array into pages */
export function paginate<T>(arr: T[], pageSize: number, page: number): T[] {
  const start = page * pageSize;
  return arr.slice(start, start + pageSize);
}

/** Get current time in HH:MM format in Europe/Chisinau timezone */
export function getNowTimeHHMM(): string {
  return new Date().toLocaleTimeString('sv-SE', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Minutes between departure time (HH:MM) and current time. Positive = late */
export function minutesLate(departureTime: string): number {
  const now = getNowTimeHHMM();
  const [nh, nm] = now.split(':').map(Number);
  const dep = departureTime.slice(0, 5);
  const [dh, dm] = dep.split(':').map(Number);
  return (nh * 60 + nm) - (dh * 60 + dm);
}

/** Haversine distance between two lat/lon points in meters */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
