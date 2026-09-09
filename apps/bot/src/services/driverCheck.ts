// Poza șoferului (aplicația de peron). Ion 08.09: «aplicația nu propune,
// aplicația fixează; operatorul doar face poza ca să se vadă încălțămintele și
// capul». Claude decide cele trei verdicte (uniformă, bărbierit, aspect îngrijit),
// verdictul e final — operatorul nu-l poate răsturna; serverul îl scrie în
// driver_appearance_checks (*_model și uniform_ok/groomed_ok, aceleași valori) și în
// `reports` la POST /report. Cadrul obligatoriu: șoferul din față, întreg, de la
// încălțăminte până la cap — altfel `cadru_complet=false` și aplicația cere refacerea.
// Descrierea uniformei NU stă aici — vine din config.DRIVER_UNIFORM_DESCRIPTION.
//
// Criteriile de mai jos sunt răspunsurile lui Ion din interviul de pe 09.09
// (docs/specs/peron-app-criteria-v2.md): uniformă = tricou vișiniu SAU cămașă
// albă/bleu uni băgată în pantaloni; fără șlapi, restul curat; șapcă, ochelari,
// mască OK; haine rupte/murdare/pantaloni scurți = neîngrijit; poză neclară =
// cadru incomplet. Poza se face o dată pe zi per șofer (vezi api/day.ts driverChecks).
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export const DRIVER_CHECK_MODEL = 'claude-opus-5';

/** Ce trebuie să se vadă în poză; e și hint-ul din aplicație, și mesajul la REFA_POZA. */
export const DRIVER_FRAME_HINT = 'Șoferul din față, întreg: să se vadă încălțămintea și capul';

/** Exportat doar pentru test (frazele-cheie ale criteriilor lui Ion). */
export const DRIVER_SYSTEM_PROMPT = `Ești inspectorul companiei de transport TRANSLUX. Primești poza unui șofer de microbuz, făcută de operatorul de peron o dată pe zi, înainte de prima lui cursă, și decizi dacă șoferul arată conform. Decizia ta e finală — nimeni n-o mai confirmă.

Cadrul obligatoriu: șoferul din față, întreg, în picioare, de la încălțăminte până la cap. «cadru_complet» = true doar dacă se văd clar și încălțămintea, și capul șoferului. Poză din spate, tăiată (fără picioare sau fără cap), prea departe, în contralumină, mișcată, prea întunecată sau neclară ca să se vadă hainele și încălțămintea → cadru_complet=false, cu descrierea a ce lipsește sau ce nu se vede (ex: «nu se vede încălțămintea», «șoferul e din spate», «poză mișcată, hainele nu se disting»).

Dacă în poză nu se vede nicio persoană (lipsește sau e doar un fragment), setează persoana_vizibila=false și cadru_complet=false.

Când cadrul nu e complet sau persoana nu e vizibilă, lasă cele trei verdicte false. Nu ghici.

Uniforma: ${config.DRIVER_UNIFORM_DESCRIPTION}. «uniforma» = true dacă șoferul poartă vizibil UNA din cele două variante — tricoul vișiniu (bordo) cu emblema TRANSLUX pe piept SAU o cămașă albă ori bleu, într-o singură culoare, băgată în pantaloni — ȘI încălțăminte acceptată. Cămașă în carouri, cu dungi sau cu model, cămașă scoasă din pantaloni, tricou de altă culoare, haină groasă care acoperă complet tricoul sau cămașa → uniforma=false. Încălțămintea: fără șlapi — șlapi, papuci de plajă, flip-flops → uniforma=false. Sandale, pantofi, adidași, ghete sunt în regulă dacă sunt curate; încălțăminte vizibil murdară (noroi, praf gros) → uniforma=false.

Bărbierit: «barbierit» = true dacă șoferul e bărbierit sau are barba îngrijită: scurtă, egală, tunsă. Barbă de câteva zile, neregulată, neîngrijită → barbierit=false. Dacă poartă mască și barba nu se vede, barbierit=true și scrie în descriere că fața e acoperită.

Aspect îngrijit: «aspect_ingrijit» = false dacă hainele sunt rupte (blugi rupți), murdare (pete vizibile), mototolite rău sau dacă poartă pantaloni scurți. Altfel true. Culoarea pantalonilor nu contează.

Șapca, ochelarii de soare și masca sunt în regulă: nu ceri refacerea pozei pentru ele și nu le penalizezi. Judeci ce se vede; ce e acoperit de ele nu se ține împotriva șoferului.

Judeci doar ce se vede. Descrierea: o propoziție scurtă, în română, cu ce se vede (ex: «tricou vișiniu TRANSLUX, adidași curați, bărbierit», «cămașă bleu băgată în pantaloni, șlapi»). Răspunzi doar în formatul JSON cerut.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cadru_complet', 'persoana_vizibila', 'uniforma', 'barbierit', 'aspect_ingrijit', 'descriere'],
  properties: {
    cadru_complet: { type: 'boolean', description: 'Șoferul din față, întreg: se văd încălțămintea și capul' },
    persoana_vizibila: { type: 'boolean', description: 'Se vede o persoană în poză' },
    uniforma: { type: 'boolean', description: 'Tricou vișiniu TRANSLUX sau cămașă albă/bleu uni băgată în pantaloni; fără șlapi, încălțăminte curată' },
    barbierit: { type: 'boolean', description: 'Bărbierit sau barbă îngrijită, scurtă și egală (cu mască: true)' },
    aspect_ingrijit: { type: 'boolean', description: 'Haine nerupte, curate, nemototolite; fără pantaloni scurți' },
    descriere: { type: 'string' },
  },
} as const;

export interface DriverAnswer {
  /** Cadrul cerut: din față, întreg, încălțăminte → cap. false → aplicația cere refacerea pozei. */
  frameOk: boolean;
  personVisible: boolean;
  uniformOk: boolean;
  shavedOk: boolean;
  groomedOk: boolean;
  /** Verdictele brute ca text + descrierea modelului (vezi describeDriverVerdicts); la cadru incomplet doar descrierea. */
  description: string;
}

export type DriverPhotoResult =
  | ({ verdict: 'OK' } & DriverAnswer)
  | { verdict: 'EROARE'; description: string };

const daNu = (v: boolean) => (v ? 'da' : 'nu');

/** «uniformă: da · bărbierit: nu · aspect: da · <descriere>» — ce rămâne în driver_appearance_checks.description. */
export function describeDriverVerdicts(v: { uniformOk: boolean; shavedOk: boolean; groomedOk: boolean }, description: string): string {
  const parts = [`uniformă: ${daNu(v.uniformOk)}`, `bărbierit: ${daNu(v.shavedOk)}`, `aspect: ${daNu(v.groomedOk)}`];
  const d = description.trim();
  if (d) parts.push(d);
  return parts.join(' · ');
}

/**
 * Parsează textul modelului. Orice câmp lipsă sau de alt tip → EROARE
 * (rândul se scrie cu verdicte null, raportul la fel — nu se inventează).
 */
export function parseDriverAnswer(text: string): DriverPhotoResult {
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
  const bools = ['cadru_complet', 'persoana_vizibila', 'uniforma', 'barbierit', 'aspect_ingrijit'] as const;
  for (const k of bools) {
    if (typeof o[k] !== 'boolean') return { verdict: 'EROARE', description: `Răspunsul modelului nu are câmpul ${k}.` };
  }
  if (typeof o.descriere !== 'string') return { verdict: 'EROARE', description: 'Răspunsul modelului nu are descrierea.' };

  const personVisible = o.persoana_vizibila as boolean;
  // Fără persoană nu există cadru complet, orice ar fi zis modelul.
  const frameOk = personVisible && (o.cadru_complet as boolean);
  const verdicts = {
    uniformOk: frameOk && (o.uniforma as boolean),
    shavedOk: frameOk && (o.barbierit as boolean),
    groomedOk: frameOk && (o.aspect_ingrijit as boolean),
  };
  const raw = (o.descriere as string).trim();
  return {
    verdict: 'OK',
    frameOk,
    personVisible,
    ...verdicts,
    description: frameOk ? describeDriverVerdicts(verdicts, raw) : raw,
  };
}

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/** Judecă poza șoferului. Nu aruncă: orice eșec devine EROARE. */
export async function analyzeDriverPhoto(jpegBase64: string): Promise<DriverPhotoResult> {
  const c = anthropic();
  if (!c) {
    console.warn('[driver-check] ANTHROPIC_API_KEY lipsește — verdict EROARE');
    return { verdict: 'EROARE', description: 'Verificarea automată nu este configurată.' };
  }
  try {
    const res = await c.messages.create({
      model: DRIVER_CHECK_MODEL,
      max_tokens: 512,
      system: DRIVER_SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            {
              type: 'text',
              text: 'Evaluează șoferul din poză: cadrul complet (din față, de la încălțăminte până la cap, poză clară), persoana vizibilă, uniforma (tricou vișiniu sau cămașă albă/bleu uni băgată în pantaloni) și încălțămintea (fără șlapi, curată), bărbieritul, aspectul îngrijit (haine nerupte, curate, fără pantaloni scurți). Șapca, ochelarii și masca sunt în regulă.',
            },
          ],
        },
      ],
    });
    if (res.stop_reason === 'refusal') {
      return { verdict: 'EROARE', description: 'Modelul a refuzat evaluarea.' };
    }
    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    return parseDriverAnswer(text);
  } catch (err) {
    console.error('[driver-check] analiza a eșuat:', err);
    return { verdict: 'EROARE', description: 'Verificarea automată a eșuat.' };
  }
}
