// Poza șoferului la cursă (aplicația de peron, Ion 08.09: «conformitate șofer —
// dacă este în uniformă sau nu, aspect îngrijit sau nu»). Claude propune
// verdictele, operatorul le confirmă sau le răstoarnă în ecranul de cursă; ce
// intră în raport e verdictul operatorului, propunerea modelului rămâne în
// driver_appearance_checks (*_model). Descrierea uniformei NU stă aici — vine
// din config.DRIVER_UNIFORM_DESCRIPTION (o completează Ion).
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export const DRIVER_CHECK_MODEL = 'claude-opus-5';

const SYSTEM_PROMPT = `Ești inspectorul companiei de transport TRANSLUX. Primești poza unui șofer de microbuz, făcută de operatorul de peron înainte de plecarea cursei, și spui dacă șoferul arată conform.

Uniforma: ${config.DRIVER_UNIFORM_DESCRIPTION}. «uniforma» = true doar dacă șoferul poartă vizibil această îmbrăcăminte de serviciu.

Aspect îngrijit: bărbierit sau cu barba îngrijită, părul aranjat, hainele curate (fără pete, rupturi, șifonare puternică). «aspect_ingrijit» = true doar dacă toate se văd în regulă.

Dacă în poză nu se vede o persoană de la brâu în sus (lipsește, e prea departe, e din spate, e prea întunecat sau neclar), setează persoana_vizibila=false și lasă celelalte verdicte false. Nu ghici.

Judeci doar ce se vede. Descrierea: o propoziție scurtă, în română, cu ce se vede (haine, aspect, ce lipsește). Răspunzi doar în formatul JSON cerut.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['persoana_vizibila', 'uniforma', 'aspect_ingrijit', 'descriere'],
  properties: {
    persoana_vizibila: { type: 'boolean', description: 'Se vede o persoană de la brâu în sus' },
    uniforma: { type: 'boolean', description: 'Poartă îmbrăcămintea de serviciu descrisă' },
    aspect_ingrijit: { type: 'boolean', description: 'Bărbierit / barbă îngrijită, păr aranjat, haine curate' },
    descriere: { type: 'string' },
  },
} as const;

export interface DriverAnswer {
  personVisible: boolean;
  uniformOk: boolean;
  groomedOk: boolean;
  description: string;
}

export type DriverPhotoResult =
  | ({ verdict: 'OK' } & DriverAnswer)
  | { verdict: 'EROARE'; description: string };

/**
 * Parsează textul modelului. Orice câmp lipsă sau de alt tip → EROARE
 * (aplicația arată verdicte «necunoscut», operatorul le bifează manual).
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
  const bools = ['persoana_vizibila', 'uniforma', 'aspect_ingrijit'] as const;
  for (const k of bools) {
    if (typeof o[k] !== 'boolean') return { verdict: 'EROARE', description: `Răspunsul modelului nu are câmpul ${k}.` };
  }
  if (typeof o.descriere !== 'string') return { verdict: 'EROARE', description: 'Răspunsul modelului nu are descrierea.' };
  return {
    verdict: 'OK',
    personVisible: o.persoana_vizibila as boolean,
    uniformOk: o.uniforma as boolean,
    groomedOk: o.aspect_ingrijit as boolean,
    description: o.descriere as string,
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
            { type: 'text', text: 'Evaluează șoferul din poză: persoana vizibilă, uniforma, aspectul îngrijit.' },
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
