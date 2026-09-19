// Identitatea șoferului din poza de la peron. Ion, 19.09: «să identificăm după
// trăsături față, ca ulterior să nu poată pune alt om în poză operatorul ca să
// închidă. Dar identificarea la om trebuie de făcut nu tare rigidă».
//
// Modelul primește pozele de referință ale șoferului (driverReferences.ts) și poza
// de azi și spune dacă e aceeași persoană: «da» / «nesigur» / «nu», cu încredere și
// motiv. Nu trimitem niciun nume — modelul compară doar două seturi de poze.
//
// «Nu rigid» înseamnă trei lucruri, toate aici:
//   1. se refuză DOAR «nu» cu încredere ≥ IDENTITY_BLOCK_CONFIDENCE; «nesigur» trece;
//   2. cel mult IDENTITY_MAX_BLOCKS_PER_DAY refuzuri pe șofer pe zi — a doua poză cu
//      același verdict trece, rămâne marcată și adminul primește poza (driverPhoto.ts);
//   3. modelul căzut sau răspuns stricat → EROARE → poza trece fără verdict.
//
// Probă pe viu (19.09, 4 șoferi, 9 perechi, referințe întregi): Opus 5 — 4× «da»,
// 1× «nesigur» pe același om, 4× «nu» pe alt om; Sonnet 5 — un «da» pe alt om și
// trei «nesigur». Ion (19.09, seara) a ales totuși Sonnet 5 + referințe micșorate
// la 800 px (driverReferences.ts) pentru cost: ~5× mai ieftin. Vezi memoria
// proiectului pentru rezultatele testului cu referințe mici.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export const DRIVER_IDENTITY_MODEL = 'claude-sonnet-5';

/** «nu» sub această încredere nu refuză poza (trece ca «nesigur»). */
export const IDENTITY_BLOCK_CONFIDENCE = 0.6;
/** Câte refuzuri «alt om» pe șofer pe zi; peste, poza trece marcată. */
export const IDENTITY_MAX_BLOCKS_PER_DAY = 1;
/** «da» de la această încredere în sus poate deveni poză de referință. */
export const IDENTITY_REFERENCE_CONFIDENCE = 0.7;

export type IdentityVerdict = 'da' | 'nesigur' | 'nu';

export type IdentityResult =
  | { verdict: 'OK'; same: IdentityVerdict; confidence: number; reason: string }
  | { verdict: 'EROARE'; description: string };

/** Exportat pentru test. */
export const IDENTITY_SYSTEM_PROMPT = `Ești sistemul intern de control al companiei de transport TRANSLUX. Operatorul de peron fotografiază zilnic fiecare șofer înainte de cursă. Primești pozele de referință ale unui șofer (din zile diferite, acceptate anterior) și poza de azi trimisă pentru același șofer. Scopul e să prindem cazul în care operatorul a fotografiat ALT om în locul șoferului. Nu identifici pe nimeni după nume — compari doar dacă persoana din poza de azi pare a fi aceeași cu cea din referințe: trăsăturile feței, forma capului, părul, vârsta aparentă, statura, constituția.
Nu fi rigid: hainele se schimbă, barba crește, șapca, ochelarii sau masca pot acoperi o parte din față, lumina și unghiul diferă. Răspunde «nu» DOAR când e limpede că e alt om (trăsături clar diferite, altă vârstă, altă constituție). Când nu poți decide, răspunde «nesigur». Răspunzi doar în formatul JSON cerut.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['aceeasi_persoana', 'incredere', 'motiv'],
  properties: {
    aceeasi_persoana: { type: 'string', enum: ['da', 'nesigur', 'nu'] },
    incredere: { type: 'number', description: '0..1 cât de sigur ești de răspuns' },
    motiv: { type: 'string', description: 'O propoziție: ce se potrivește / ce diferă' },
  },
} as const;

/** Parsează răspunsul modelului; orice câmp lipsă → EROARE (nu se inventează). */
export function parseIdentityAnswer(text: string): IdentityResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { verdict: 'EROARE', description: 'Răspunsul modelului nu e JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { verdict: 'EROARE', description: 'Răspunsul modelului nu e un obiect.' };
  }
  const o = parsed as Record<string, unknown>;
  const same = o.aceeasi_persoana;
  if (same !== 'da' && same !== 'nesigur' && same !== 'nu') {
    return { verdict: 'EROARE', description: 'Răspunsul modelului nu are aceeasi_persoana.' };
  }
  const raw = typeof o.incredere === 'number' && Number.isFinite(o.incredere) ? o.incredere : null;
  if (raw === null) return { verdict: 'EROARE', description: 'Răspunsul modelului nu are incredere.' };
  const confidence = Math.min(1, Math.max(0, raw));
  const reason = typeof o.motiv === 'string' ? o.motiv.trim() : '';
  return { verdict: 'OK', same, confidence, reason };
}

/** Poza se refuză operatorului? Doar «nu» sigur, și doar dacă azi n-a mai fost refuzat. */
export function shouldBlockIdentity(result: IdentityResult, blocksToday: number): boolean {
  if (result.verdict !== 'OK') return false;
  if (result.same !== 'nu') return false;
  if (result.confidence < IDENTITY_BLOCK_CONFIDENCE) return false;
  return blocksToday < IDENTITY_MAX_BLOCKS_PER_DAY;
}

/** Poza poate intra la referințe (confirmată «da», sigur)? */
export function isReferenceWorthy(result: IdentityResult): boolean {
  return result.verdict === 'OK' && result.same === 'da' && result.confidence >= IDENTITY_REFERENCE_CONFIDENCE;
}

/** Mesajul pentru operator când poza e refuzată. */
export function altOmMessage(driverName: string | null, reason: string): string {
  const who = driverName ? `șoferul ${driverName}` : 'șoferul de pe cursă';
  const why = reason.trim();
  return `Persoana din poză nu pare a fi ${who}${why ? ` (${why})` : ''}. Refă poza cu ${who}.`;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } };
const imageBlock = (data: string): ImageBlock => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });

/**
 * Compară poza de azi cu referințele. Nu aruncă: orice eșec devine EROARE.
 * Fără referințe nu există comparație — apelantul nu cheamă funcția.
 */
export async function compareDriverIdentity(referencesBase64: string[], probeBase64: string): Promise<IdentityResult> {
  if (referencesBase64.length === 0) return { verdict: 'EROARE', description: 'Fără poze de referință.' };
  const c = anthropic();
  if (!c) {
    console.warn('[driver-identity] ANTHROPIC_API_KEY lipsește — fără verdict');
    return { verdict: 'EROARE', description: 'Verificarea automată nu este configurată.' };
  }
  try {
    const res = await c.messages.create({
      model: DRIVER_IDENTITY_MODEL,
      max_tokens: 400,
      system: IDENTITY_SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Pozele de referință ale șoferului (${referencesBase64.length}):` },
            ...referencesBase64.map(imageBlock),
            { type: 'text', text: 'Poza de azi trimisă pentru același șofer:' },
            imageBlock(probeBase64),
            { type: 'text', text: 'E aceeași persoană în poza de azi ca în pozele de referință?' },
          ],
        },
      ],
    });
    if (res.stop_reason === 'refusal') {
      return { verdict: 'EROARE', description: 'Modelul a refuzat comparația.' };
    }
    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    return parseIdentityAnswer(text);
  } catch (err) {
    console.error('[driver-identity] comparația a eșuat:', err);
    return { verdict: 'EROARE', description: 'Verificarea automată a eșuat.' };
  }
}
