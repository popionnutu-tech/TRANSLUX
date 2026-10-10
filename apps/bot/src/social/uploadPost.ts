// Clientul Upload-Post (plan 09.10, «API-ul Upload-Post»): un singur API publică pe TikTok, Facebook și Instagram,
// inclusiv stories (`media_type=STORIES`). Documentația: docs.upload-post.com/api/upload-video, /api/upload-status.
// Cheia stă doar în Railway (UPLOAD_POST_API_KEY). Calendarul e al nostru (social_posts), nu al Upload-Post: clipul
// pleacă abia la ora lui, fără `scheduled_date`, ca Anulează / Mută să meargă până în ultimul minut.

export const UPLOAD_POST_BAZA = 'https://api.upload-post.com/api';
export type Platforma = 'tiktok' | 'facebook' | 'instagram';
export const PLATFORME: readonly Platforma[] = ['tiktok', 'facebook', 'instagram'];
/** TikTok nu primește stories prin API (plan, «Stories»); restul da. */
export const PLATFORME_STORY: readonly Platforma[] = ['facebook', 'instagram'];

export interface CererePublicare {
  /** Profilul Upload-Post al topicului. */
  user: string;
  platforme: Platforma[];
  tip: 'video' | 'story';
  text: string;
  facebookPageId?: string | null;
  primulComentariu?: string | null;
  /** Id-ul nostru (social_posts.id): Upload-Post îl folosește ca cheie de idempotență — retrimiterea nu dublează. */
  idPostare: string;
}

/** Câmpurile formularului (fără fișier). Pur, testat. */
export function campuriPublicare(c: CererePublicare): Array<[string, string]> {
  const f: Array<[string, string]> = [['user', c.user]];
  for (const p of c.platforme) f.push(['platform[]', p]);
  // TikTok: titlul e descrierea clipului (până la 2200 de caractere). Facebook ia `description`; Instagram, titlul.
  f.push(['title', c.text.slice(0, 2200)]);
  f.push(['description', c.text]);
  f.push(['async_upload', 'true']);
  f.push(['request_id', c.idPostare]);
  f.push(['external_id', c.idPostare]);
  if (c.platforme.includes('tiktok')) {
    f.push(['privacy_level', 'PUBLIC_TO_EVERYONE']);
    f.push(['post_mode', 'DIRECT_POST']);
  }
  if (c.platforme.includes('instagram')) f.push(['media_type', c.tip === 'story' ? 'STORIES' : 'REELS']);
  if (c.platforme.includes('facebook')) {
    f.push(['facebook_media_type', c.tip === 'story' ? 'STORIES' : 'REELS']);
    if (c.facebookPageId) f.push(['facebook_page_id', c.facebookPageId]);
  }
  // Story-ul n-are comentarii; primul comentariu doar sub clipurile din feed.
  if (c.tip === 'video' && c.primulComentariu) f.push(['first_comment', c.primulComentariu]);
  return f;
}

export class EroareUploadPost extends Error {
  constructor(message: string, readonly status: number, readonly definitiva: boolean) {
    super(message);
  }
}

/** Trimite clipul. Întoarce `request_id` (asincron) — rezultatul vine din `stareaPublicarii`. */
export async function publica(cheie: string, c: CererePublicare, video: Blob, numeFisier: string): Promise<string> {
  const form = new FormData();
  for (const [k, v] of campuriPublicare(c)) form.append(k, v);
  form.append('video', video, numeFisier);
  const r = await fetch(`${UPLOAD_POST_BAZA}/upload`, {
    method: 'POST',
    headers: { Authorization: `Apikey ${cheie}`, 'Idempotency-Key': c.idPostare },
    body: form,
    signal: AbortSignal.timeout(20 * 60_000),
  });
  const corp = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || corp.success === false) {
    const mesaj = String(corp.error ?? corp.message ?? `HTTP ${r.status}`);
    // 4xx în afară de 429 = cererea e greșită (profil, plan, câmpuri): retrimiterea n-ajută.
    throw new EroareUploadPost(mesaj, r.status, r.status >= 400 && r.status < 500 && r.status !== 429);
  }
  return String(corp.request_id ?? c.idPostare);
}

export interface RezultatPlatforma {
  platforma: string;
  reusit: boolean;
  url: string | null;
  mesaj: string | null;
  /** TikTok a pus clipul în ciorne: trebuie apăsat «Postează» în aplicație. */
  inCiorne: boolean;
  sarit: boolean;
}

export interface StarePublicare {
  stare: 'in_lucru' | 'gata' | 'esuat' | 'negasit';
  rezultate: RezultatPlatforma[];
  brut: unknown;
}

/** Răspunsul `GET /uploadposts/status` → starea noastră. Pur, testat. Câmpurile lipsă se tratează cu blândețe. */
export function interpreteazaStarea(corp: Record<string, unknown>): StarePublicare {
  const lista = Array.isArray(corp.results) ? (corp.results as Record<string, unknown>[]) : [];
  const rezultate: RezultatPlatforma[] = lista.map((x) => {
    const url = [x.post_url, x.url].find((u) => typeof u === 'string' && /^https?:\/\//.test(u)) as string | undefined;
    const st = String(x.status ?? '');
    return {
      platforma: String(x.platform ?? '?'),
      reusit: x.success === true || st === 'completed',
      url: url ?? null,
      mesaj: x.message != null ? String(x.message) : (x.error != null ? String(x.error) : null),
      inCiorne: x.fallback_to_inbox === true,
      sarit: x.skipped === true || st === 'skipped',
    };
  });
  const s = String(corp.status ?? '');
  if (s === 'completed') return { stare: 'gata', rezultate, brut: corp };
  if (s === 'not_found') return { stare: 'negasit', rezultate, brut: corp };
  if (s === 'failed') return { stare: 'esuat', rezultate, brut: corp };
  // `in_progress` cu toate platformele terminate (unele căzute definitiv) = gata, cu ce a ieșit.
  const total = Number(corp.total ?? 0);
  if (total > 0 && Number(corp.completed ?? 0) >= total && rezultate.length >= total) {
    return { stare: rezultate.some((r) => r.reusit) ? 'gata' : 'esuat', rezultate, brut: corp };
  }
  return { stare: 'in_lucru', rezultate, brut: corp };
}

export async function stareaPublicarii(cheie: string, requestId: string): Promise<StarePublicare> {
  const r = await fetch(`${UPLOAD_POST_BAZA}/uploadposts/status?request_id=${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Apikey ${cheie}` },
    signal: AbortSignal.timeout(30_000),
  });
  const corp = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (r.status === 404) return { stare: 'negasit', rezultate: [], brut: corp };
  if (!r.ok) throw new EroareUploadPost(String(corp.error ?? `HTTP ${r.status}`), r.status, false);
  return interpreteazaStarea(corp);
}
