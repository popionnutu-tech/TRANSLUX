/**
 * Calculul ofertei Bălți ↔ Chișinău — sursa unică pentru site (apps/web
 * searchTrips), vocea și FB-botul (apps/admin trips-search).
 *
 * Oglindește exact formula RPC update_prices_by_rate_v2 (migr. 094):
 * GREATEST(ROUND(133 × rată) − reducere, 0). Baza e fixă la 133 km — NU km-ul
 * rutei individuale: rutele Bălți–Chișinău au 133 sau 134 km în
 * v_interurban_v2_km_pairs, iar reducerea aplicată per rută ar afișa două
 * „prețuri de ofertă" diferite (ex. 129 și 130) în același ecran.
 */

export const BALTI_OFFER_KM = 133;

/**
 * Prețul fix Bălți → Chișinău (Ion, 01.10.2026, ION-165: «începând de mâine
 * biletul 150 Bălți Chișinău, returul lași la fel»). Din ziua `from` (data
 * cursei) prețul nu mai urmează rata săptămânală — e `lei`, doar pe sensul
 * Bălți → Chișinău; Chișinău → Bălți rămâne km × rată. Înainte de `from`,
 * formula veche (133 × rată − reducere).
 */
export const BALTI_CHISINAU_FIXED = { lei: 150, from: '2026-10-02' } as const;

/** Azi în Chișinău, YYYY-MM-DD. */
function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Prețul fix al zilei pentru sensul Bălți → Chișinău, sau null (alt sens / înainte de data de început). */
export function baltiChisinauFixedPrice(fromLocality: string, toLocality: string, date?: string | null): number | null {
  if (norm(fromLocality) !== 'balti' || norm(toLocality) !== 'chisinau') return null;
  return (date || todayChisinau()) >= BALTI_CHISINAU_FIXED.from ? BALTI_CHISINAU_FIXED.lei : null;
}

/** Prețul ofertei pentru o rată interurban-lung dată (lei/km). */
export function computeBaltiOfferPrice(rateLong: number, discount: number): number {
  return Math.max(0, Math.round(BALTI_OFFER_KM * rateLong) - discount);
}

/** Reducerea curentă, derivată din rândul tabelei offers (azi 145−125 = 20 lei). */
export function offerDiscountOf(originalPrice: number, offerPrice: number): number {
  return Math.max(0, originalPrice - offerPrice);
}

/**
 * Doar oferta auto-gestionată Bălți↔Chișinău se recalculează pe rata datei
 * căutate; ofertele manuale pentru alte perechi păstrează offer_price fix
 * (contractul istoric al tabelei offers).
 */
export function isBaltiChisinauOffer(fromLocality: string, toLocality: string): boolean {
  const pair = [norm(fromLocality), norm(toLocality)];
  return pair.includes('balti') && pair.includes('chisinau');
}

/**
 * Varianta „ambele prețuri" pentru afișare (banner / tool-ul get_offers):
 * pentru Bălți↔Chișinău recalculează original + offer pe rata dată,
 * ofertele manuale rămân neatinse.
 */
export function resolveOfferForDate<
  T extends { from_locality: string; to_locality: string; original_price: number; offer_price: number },
>(offer: T, rateLong: number | null, date?: string | null): T {
  if (!rateLong || !isBaltiChisinauOffer(offer.from_locality, offer.to_locality)) return offer;
  const fixed = baltiChisinauFixedPrice(offer.from_locality, offer.to_locality, date);
  if (fixed != null) return { ...offer, original_price: Math.round(BALTI_OFFER_KM * rateLong), offer_price: fixed };
  return {
    ...offer,
    original_price: Math.round(BALTI_OFFER_KM * rateLong),
    offer_price: computeBaltiOfferPrice(
      rateLong,
      offerDiscountOf(Number(offer.original_price), Number(offer.offer_price)),
    ),
  };
}

/**
 * Prețul ofertei pentru data căutată (`date` = ziua cursei; lipsă = azi). Din
 * BALTI_CHISINAU_FIXED.from, pe sensul Bălți → Chișinău: prețul fix. Altfel: formula RPC pe rata datei pentru perechea
 * Bălți↔Chișinău, altfel offer_price din tabel neatins.
 */
export function resolveOfferPriceForDate(
  offer: { from_locality: string; to_locality: string; original_price: number; offer_price: number },
  rateLong: number | null,
  date?: string | null,
): number {
  const fixed = baltiChisinauFixedPrice(offer.from_locality, offer.to_locality, date);
  if (fixed != null) return fixed;
  if (rateLong && isBaltiChisinauOffer(offer.from_locality, offer.to_locality)) {
    return computeBaltiOfferPrice(
      rateLong,
      offerDiscountOf(Number(offer.original_price), Number(offer.offer_price)),
    );
  }
  return Number(offer.offer_price);
}
