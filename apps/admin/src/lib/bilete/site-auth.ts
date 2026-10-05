import 'server-only';
import { timingSafeEqual } from 'crypto';

// Cheia site-ului (ION-193): BILETE_API_KEY, doar pe serverul translux.md și pe central-hub. Deschide rutele pe care
// site-ul le cheamă server-la-server (comanda, biletele clientului din mini app-ul Telegram, ION-249). ≥ 256 biți;
// separată de cheia botului (bot-auth.ts). Extrasă din app/api/bilete/comanda/route.ts când a apărut a doua rută.

const BEARER_RE = /^Bearer\s+(.+)$/i;
/** 32 de octeți hex = 256 de biți. */
const LUNGIME_MINIMA = 64;

export function cheieSiteValida(authorization: string | null): boolean {
  const asteptat = process.env.BILETE_API_KEY;
  if (!asteptat || asteptat.length < LUNGIME_MINIMA) {
    console.error('[bilete] BILETE_API_KEY lipsește sau e prea scurtă');
    return false;
  }
  const primit = BEARER_RE.exec(authorization ?? '')?.[1]?.trim() ?? '';
  if (!primit) return false;
  const a = Buffer.from(primit);
  const b = Buffer.from(asteptat);
  return a.length === b.length && timingSafeEqual(a, b);
}
