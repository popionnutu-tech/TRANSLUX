import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.js';

// ION-274 («Telegram ultrafast» P10): panoul anunță botul imediat după plată — `POST /bilete/v1/livreaza {checkout_id}` cu
// `Authorization: Bearer <BILETE_LIVRARE_KEY>` (cheie NOUĂ, doar pe direcția panou → bot, ≥ 64 de caractere; separată de
// BILETE_BOT_API_KEY, care merge bot → panou). Botul nu trimite nimic din cerere: doar «împinge» jobul «Bilete noi» prin
// zăvorul lui (scheduler.ruleazaBileteNoiAcum), care citește comenzile de livrat din bază. Corp ≤ 4 KB. Dispecerul stă în
// index.ts ÎNAINTEA ramurii webhook (o cale în afara /app/v1 ar cădea acolo).

export const CALE_LIVRARE = '/bilete/v1/livreaza';
const CORP_MAX = 4096;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cheia din antet e cea așteptată (lungime egală, comparație în timp constant); fără cheie configurată → nimic nu trece. Pur. */
export function cheieLivrareValida(authorization: string | undefined, asteptat: string): boolean {
  if (!asteptat || asteptat.length < 64) return false;
  const primit = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1]?.trim() ?? '';
  if (!primit) return false;
  const a = Buffer.from(primit); const b = Buffer.from(asteptat);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Corpul cererii: { checkout_id: uuid }; altceva → null. Pur. */
export function parseazaCorpLivrare(text: string): { checkout_id: string } | null {
  if (text.length > CORP_MAX) return null;
  try {
    const j = JSON.parse(text) as { checkout_id?: unknown };
    return typeof j?.checkout_id === 'string' && UUID_RE.test(j.checkout_id) ? { checkout_id: j.checkout_id.toLowerCase() } : null;
  } catch { return null; }
}

export interface DepsLivrare {
  /** Pornește jobul «Bilete noi» acum (sau încă o trecere, dacă rulează deja). */
  ruleazaAcum: () => void;
  cheie?: string;
  jurnal?: (m: string) => void;
}

function citesteCorp(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let s = ''; let prea = false;
    req.on('data', (c: Buffer) => { if (prea) return; s += c.toString('utf8'); if (s.length > CORP_MAX) { prea = true; } });
    req.on('end', () => resolve(prea ? null : s));
    req.on('error', () => resolve(null));
  });
}

/** true = cererea era pentru /bilete/v1/livreaza și a primit răspuns. */
export async function handleLivrare(req: IncomingMessage, res: ServerResponse, deps: DepsLivrare): Promise<boolean> {
  const url = (req.url ?? '').split('?')[0];
  if (url !== CALE_LIVRARE) return false;
  const raspuns = (status: number, corp: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corp)); };
  if ((req.method || '').toUpperCase() !== 'POST') { raspuns(405, { ok: false }); return true; }
  if (!cheieLivrareValida(req.headers.authorization, deps.cheie ?? config.bileteLivrareKey)) { raspuns(401, { ok: false }); return true; }
  const text = await citesteCorp(req);
  const corp = text == null ? null : parseazaCorpLivrare(text);
  if (!corp) { raspuns(400, { ok: false, eroare: 'corp nevalid' }); return true; }
  (deps.jurnal ?? ((m: string) => console.log(m)))(`[bilete/livreaza] ${corp.checkout_id.slice(0, 8)}: pornesc jobul`);
  deps.ruleazaAcum();
  raspuns(202, { ok: true });
  return true;
}
