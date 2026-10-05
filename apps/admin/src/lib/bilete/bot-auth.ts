import 'server-only';
import { timingSafeEqual } from 'crypto';

// Cheia botului (ION-244): BILETE_BOT_API_KEY, separată de cheia site-ului (BILETE_API_KEY) — deschide DOAR
// rutele /api/bilete/retur/* și /api/bilete/plangere (ION-252). ≥ 256 biți, doar pe central-hub și în Railway (bot).

const BEARER_RE = /^Bearer\s+(.+)$/i;

export function cheieBotValida(authorization: string | null): boolean {
  const asteptat = process.env.BILETE_BOT_API_KEY;
  if (!asteptat || asteptat.length < 64) {
    console.error('[bilete/retur] BILETE_BOT_API_KEY lipsește sau e prea scurtă');
    return false;
  }
  const primit = BEARER_RE.exec(authorization ?? '')?.[1]?.trim() ?? '';
  if (!primit) return false;
  const a = Buffer.from(primit);
  const b = Buffer.from(asteptat);
  return a.length === b.length && timingSafeEqual(a, b);
}
