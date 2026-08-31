// Logica pură a dispeceratului de camioane (Ion, 31.08.2026). Fără acces la BD —
// aceleași funcții le folosesc și pagina, și acțiunile server (verificarea
// suprapunerii se face ȘI pe server, nu doar în formular).
export type TripWindow = { id: string; vehicleId: string; loadAt: string; unloadAt: string; status: string };

/**
 * Cursa nouă/editată se suprapune peste alta a ACELUIAȘI camion?
 * Capetele lipite (descărcare la 18:00 → încărcare la 18:00) NU se suprapun:
 * dispecerul planifică des cursa următoare din același punct, la aceeași oră.
 */
export function seSuprapune(
  nou: { vehicleId: string; loadAt: string; unloadAt: string; id?: string },
  existente: TripWindow[],
): TripWindow | null {
  const a1 = Date.parse(nou.loadAt);
  const a2 = Date.parse(nou.unloadAt);
  for (const t of existente) {
    if (t.vehicleId !== nou.vehicleId) continue;
    if (nou.id && t.id === nou.id) continue;
    if (t.status === 'anulata') continue;
    const b1 = Date.parse(t.loadAt);
    const b2 = Date.parse(t.unloadAt);
    if (a1 < b2 && b1 < a2) return t;
  }
  return null;
}

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distanță în linie dreaptă. Pentru avertizarea «cine e mai aproape» e destul:
 *  comparăm camioane între ele, nu promitem km de drum. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(s));
}

/**
 * Avertizarea anti-greșeală (cazul lui Ion: camionul din Bălți trimis la Constanța,
 * cel din Chișinău la Berdichev). Întoarce camioanele mai aproape de punctul de
 * încărcare decât cel ales. Doar informativ — decide dispecerul.
 */
export function camioaneMaiAproape(
  target: { lat: number; lng: number },
  ales: { vehicleId: string; lat: number; lng: number } | null,
  candidate: { vehicleId: string; plate: string; lat: number; lng: number }[],
  maxRezultate = 3,
): { vehicleId: string; plate: string; km: number; economieKm: number }[] {
  // Fără poziția camionului ales nu există comparație: altfel kmAles = Infinity
  // și panoul arăta toate camioanele cu «0 km mai puțin» (audit 31.08, Medium #5).
  // Ieri doar 21 din 39 de camioane au raportat GPS — cazul e frecvent.
  if (!ales) return [];
  const kmAles = haversineKm(target, ales);
  return candidate
    .filter((c) => !ales || c.vehicleId !== ales.vehicleId)
    .map((c) => ({ vehicleId: c.vehicleId, plate: c.plate, km: haversineKm(target, c) }))
    .filter((c) => c.km < kmAles)
    .sort((x, y) => x.km - y.km)
    .slice(0, maxRezultate)
    .map((c) => ({ ...c, economieKm: Number.isFinite(kmAles) ? Math.round(kmAles - c.km) : 0 }));
}

/**
 * «Camionul are șofer» pentru kanban. Atribuirea din parc (lde_active_assignments)
 * NU e singura sursă: dispecerul poate pune un șofer direct pe cursă, fără să
 * schimbe atribuirea permanentă. Fără această a doua sursă, un camion cu cursă
 * activă dar fără atribuire ar cădea în «fara_sofer» și cursa lui ar dispărea din
 * kanban (audit 31.08, High #2).
 */
export function areSofer(input: { atribuireActiva: boolean; soferPeCursaActiva: boolean }): boolean {
  return input.atribuireActiva || input.soferPeCursaActiva;
}

export type KanbanColumn = 'liber' | 'in_cursa' | 'reparatie' | 'odihna' | 'fara_sofer';

/**
 * Coloana din kanban. null = camionul NU apare deloc: fără șofer nu lucrează și
 * nu se ia în considerare (Ion, 31.08) — dar dacă GPS-ul îi arată km substanțiali,
 * apare în coloana «fara_sofer» ca solicitare de atribuire.
 * Reparația și odihna bat orice: camionul stă, indiferent ce zice planul.
 */
export function coloanaKanban(
  input: { areSofer: boolean; kmAzi: number; stareZi: 'reparatie' | 'odihna' | null; cursaActiva: boolean },
  pragKmFaraSofer = 5,
): KanbanColumn | null {
  // Cursa activă bate TOT — și lipsa șoferului, și starea zilei. Altfel prima
  // cursă pusă pe unul din cele 23 de camioane fără atribuire dispărea de pe
  // tablou cu tot cu cursă (audit 31.08, High #2), iar o reparație pusă peste o
  // cursă deschisă ascundea butonul care o încheie. Starea zilei rămâne vizibilă
  // ca insignă pe cartonaș.
  if (input.cursaActiva) return 'in_cursa';
  if (input.stareZi) return input.stareZi;
  if (!input.areSofer) return input.kmAzi > pragKmFaraSofer ? 'fara_sofer' : null;
  return 'liber';
}

/** Ordinea stărilor cursei. Dispecerul le mută manual, dar nu sare peste etape. */
export const TRIP_FLOW: readonly string[] = [
  'planificata', 'spre_incarcare', 'la_incarcare', 'spre_descarcare', 'la_descarcare', 'incheiata',
];

/** Următoarea stare permisă, sau null dacă cursa e la capăt/anulată. */
export function urmatoareaStare(status: string): string | null {
  const i = TRIP_FLOW.indexOf(status);
  if (i < 0 || i === TRIP_FLOW.length - 1) return null;
  return TRIP_FLOW[i + 1];
}

/** Zilele (ISO, fus Chișinău) acoperite de cursă — pentru desenul barei în grilă. */
export function zileleCursei(loadAt: string, unloadAt: string): string[] {
  const zi = (iso: string) =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Chisinau' }).format(new Date(iso));
  const out: string[] = [];
  const start = zi(loadAt);
  const end = zi(unloadAt);
  const d = new Date(`${start}T12:00:00Z`);
  for (let i = 0; i < 60; i++) {
    const cur = d.toISOString().slice(0, 10);
    out.push(cur);
    if (cur >= end) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
