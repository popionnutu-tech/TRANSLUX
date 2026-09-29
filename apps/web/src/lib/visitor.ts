import { createHash } from 'crypto';

/**
 * Amprenta vizitatorului pentru analitică (ION-142, Ion 29.09: «nu se înțelege câte unice»):
 * SHA-256(sare + IP + user-agent), primele 16 hex. Fără cookie — adresa nu se poate citi înapoi,
 * dar aceeași sursă se recunoaște de la o zi la alta (anomaliile «multe căutări zilnice», migr. 439).
 * Sarea e VIZITATOR_SALT, doar a ei, și fără ea nu se scrie nimic: cu o sare cunoscută (cheia anon,
 * pe care o are orice client) cele 2^32 de adrese IPv4 se încearcă toate în câteva minute și amprenta
 * dă IP-ul înapoi (revizia ION-142; pe translux-web IP_HASH_SALT nu e setat). ip_hash rămâne separat: pe el numără anti-scraperul.
 *
 * Nu aruncă: un vizitator lipsă nu are voie să rupă logul.
 */
export function visitorHash(h: Headers): string | null {
  try {
    const salt = process.env.VIZITATOR_SALT;
    const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || null;
    if (!salt || !ip) return null;
    return createHash('sha256').update(`${salt}|${ip}|${h.get('user-agent') ?? ''}`).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}
