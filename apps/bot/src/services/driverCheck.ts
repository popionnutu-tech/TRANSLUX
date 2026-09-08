// Poza șoferului la cursă (aplicația de peron). Ion 08.09: «aplicația nu propune,
// aplicația fixează; operatorul doar face poza ca să se vadă încălțămintele și
// capul». Claude decide cele trei verdicte (uniformă, bărbierit, aspect îngrijit),
// verdictul e final — operatorul nu-l poate răsturna; serverul îl scrie în
// driver_appearance_checks (*_model și uniform_ok/groomed_ok, aceleași valori) și în
// `reports` la POST /report. Cadrul obligatoriu: șoferul din față, întreg, de la
// încălțăminte până la cap — altfel `cadru_complet=false` și aplicația cere refacerea.
// Descrierea uniformei NU stă aici — vine din config.DRIVER_UNIFORM_DESCRIPTION
// (o completează Ion).
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export const DRIVER_CHECK_MODEL = 'claude-opus-5';

/** Ce trebuie să se vadă în poză; e și hint-ul din aplicație, și mesajul la REFA_POZA. */
export const DRIVER_FRAME_HINT = 'Șoferul din față, întreg: să se vadă încălțămintea și capul';

const SYSTEM_PROMPT = `Ești inspectorul companiei de transport TRANSLUX. Primești poza unui șofer de microbuz, făcută de operatorul de peron înainte de plecarea cursei, și decizi dacă șoferul arată conform. Decizia ta e finală — nimeni n-o mai confirmă.

Cadrul obligatoriu: șoferul din față, întreg, în picioare, de la încălțăminte până la cap. «cadru_complet» = true doar dacă se văd clar și încălțămintea, și capul (fața) șoferului. Poză din spate, tăiată (fără picioare sau fără cap), prea departe, prea întunecată sau neclară → cadru_complet=false, cu descrierea a ce lipsește (ex: «nu se vede încălțămintea», «șoferul e din spate»).

Dacă în poză nu se vede nicio persoană (lipsește sau e doar un fragment), setează persoana_vizibila=false și cadru_complet=false.

Când cadrul nu e complet sau persoana nu e vizibilă, lasă cele trei verdicte false. Nu ghici.

Uniforma: ${config.DRIVER_UNIFORM_DESCRIPTION}. «uniforma» = true doar dacă șoferul poartă vizibil această îmbrăcăminte de serviciu ȘI încălțăminte corespunzătoare: pantofi sau ghete închise, curate. Șlapi, sandale, papuci sau încălțăminte sport murdară → uniforma=false.

Bărbierit: «barbierit» = true dacă șoferul e bărbierit sau are barba îngrijită, scurtă și egală. Barbă de câteva zile, neîngrijită → barbierit=false.

Aspect îngrijit: «aspect_ingrijit» = true doar dacă părul e aranjat, hainele sunt curate, fără pete, fără haine mototolite sau rupte.

Judeci doar ce se vede. Descrierea: o propoziție scurtă, în română, cu ce se vede (ex: «cămașă albă TRANSLUX, pantofi negri, bărbierit»). Răspunzi doar în formatul JSON cerut.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cadru_complet', 'persoana_vizibila', 'uniforma', 'barbierit', 'aspect_ingrijit', 'descriere'],
  properties: {
    cadru_complet: { type: 'boolean', description: 'Șoferul din față, întreg: se văd încălțămintea și capul' },
    persoana_vizibila: { type: 'boolean', description: 'Se vede o persoană în poză' },
    uniforma: { type: 'boolean', description: 'Poartă îmbrăcămintea de serviciu descrisă și încălțăminte închisă, curată' },
    barbierit: { type: 'boolean', description: 'Bărbierit sau barbă îngrijită, scurtă și egală' },
    aspect_ingrijit: { type: 'boolean', description: 'Păr aranjat, haine curate, fără pete, nemototolite' },
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
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            {
              type: 'text',
              text: 'Evaluează șoferul din poză: cadrul complet (din față, de la încălțăminte până la cap), persoana vizibilă, uniforma și încălțămintea, bărbieritul, aspectul îngrijit.',
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
