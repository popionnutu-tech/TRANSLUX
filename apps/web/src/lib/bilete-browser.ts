import { preconnect } from 'react-dom';
import { parseazaLocuri, type LocuriCursa } from './locuri';

// Citirile din formularul de cumpărare, din browser, prin GET-uri pe același domeniu — NU prin acțiuni de server
// (Ion, 10.10.2026: «vezi cum de făcut ultra fast toată procedura»). Next pune acțiunile de server la coadă, una câte
// una: reîncărcarea hărții la 30 s sau procentul returului întârziau «Plătește» (cumparaBilet). fetch-urile merg în paralel.

/** Harta locurilor cursei (spre nord); null = indisponibilă → se cumpără fără alegere, ca înainte. */
export async function incarcaLocuri(crmRouteId: number, tripDate: string): Promise<LocuriCursa | null> {
  const q = new URLSearchParams({ crm_route_id: String(crmRouteId), trip_date: tripDate, going_north: 'true' });
  try {
    const r = await fetch(`/api/bilete/locuri?${q}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return parseazaLocuri(await r.json());
  } catch {
    return null;
  }
}

let procent: Promise<number> | null = null;

/** Procentul reducerii la retur (config-ul panoului, 546); 0 = promoția închisă sau nu s-a putut citi. */
export function procentReturBrowser(): Promise<number> {
  if (!procent) {
    procent = fetch('/api/bilete/promo').then((r) => (r.ok ? r.json() : null)).then((j) => {
      const n = Number(j?.pct);
      return Number.isFinite(n) && n >= 0 && n < 100 ? n : 0;
    }).catch(() => 0);
    // O eroare nu rămâne ținută în memorie: următoarea deschidere încearcă din nou.
    void procent.then((n) => { if (n === 0) procent = null; });
  }
  return procent;
}

/** Conexiunea cu pagina de plată maib deschisă din timp (DNS + TLS), ca redirecționarea după «Plătește» să nu aștepte. */
export function preconecteazaBanca(): void {
  try { preconnect('https://checkout.maib.md'); } catch { /* doar o sugestie pentru browser */ }
}
