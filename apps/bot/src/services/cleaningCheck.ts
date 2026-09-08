// Verificarea curățeniei la peronul Chișinău: operatorul trimite o poză pe zonă
// (peron / zona pietoni / veceu), Claude o judecă după criterii fixe și dă
// CURAT sau MURDAR. Poza se păstrează în Storage (report-photos/curatenie/...),
// verdictul intră în peron_cleaning_checks și în digestul zilnic al adminilor.
//
// Regula lui Ion (08.09): «trebuie să fie măturat» — praful, nisipul sau
// pietrișul pe pavaj înseamnă direct MURDAR, nu «atenție».
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { ReportSource } from '@translux/db';
import { createCleaningCheck, type CleaningSlot, type CleaningZone, type CleaningVerdict } from './db.js';
import { uploadReportPhoto } from './photoStorage.js';

const MODEL = 'claude-opus-5';

export const CLEANING_ZONES: CleaningZone[] = ['PERON', 'PIETONI', 'VECEU'];

export const ZONE_LABEL: Record<CleaningZone, string> = {
  PERON: 'Peron',
  PIETONI: 'Zona pietoni (stația GARA)',
  VECEU: 'Zona veceu',
};

export const SLOT_LABEL: Record<CleaningSlot, string> = {
  DIMINEATA: 'dimineață, înainte de deschiderea turei',
  ZIUA: 'ziua, ora 15:00',
};

/** Cum trebuie făcută poza, ca să fie comparabilă de la o zi la alta. */
export const ZONE_HINT: Record<CleaningZone, string> = {
  PERON: 'Din colțul parcării spre clădirea portocalie (DaviDan / AutoStoc), cu pavajul și locul microbuzului în cadru.',
  PIETONI: 'De pe trotuar, cu stâlpul cu semnul „GARA”, conurile portocalii și pavajul în cadru.',
  VECEU: 'Din ușă, cu podeaua, cabinele și chiuvetele în cadru.',
};

const SYSTEM_PROMPT = `Ești inspectorul de curățenie al companiei de transport TRANSLUX pentru peronul din Chișinău. Primești o poză făcută de operatorul de peron la deschiderea turei sau la ora 15:00 și decizi dacă zona din poză este curată.

Regula principală: zona trebuie să fie MĂTURATĂ. Praf, nisip, pietriș sau frunze pe pavaj înseamnă MURDAR, chiar dacă nu există gunoi propriu-zis.

Reperele peronului TRANSLUX din Chișinău:
- clădire modernă cu fațadă portocalie și gri, cu firmele „DaviDan” (cafenea cu terasă și umbrele) și „AutoStoc” (piese auto);
- pavaj din pavele gri, parcare cu microbuze Mercedes Sprinter albe cu inscripția TRANSLUX;
- la trotuarul dinspre stradă: stâlp de beton cu semnul de stație „GARA”, conuri sau delimitatoare portocalii pe margine, o dungă roșie pe pavaj, strada cu mai multe benzi în stânga.

Dacă poza nu conține reperele zonei cerute (e alt loc, e o poză veche fără legătură, e prea întunecată sau prea neclară ca să se vadă pavajul), setează loc_corect=false. Nu ghici.

Evaluezi doar ce se vede. Dacă un vehicul sau o persoană acoperă o parte din zonă, judecă restul și menționează asta în descriere. Umbrele copacilor nu sunt murdărie. Găleata cu mop lăsată la vedere dimineața nu e problemă (tocmai s-a spălat).

Verdict:
- CURAT: pavajul e măturat, fără gunoi, fără mucuri, fără resturi, fără buruieni evidente, coșurile nu dau pe dinafară, delimitatoarele sunt la locul lor.
- MURDAR: oricare dintre: nemăturat (praf, nisip, pietriș, frunze pe pavaj), gunoi sau ambalaje, mucuri de țigară, pete sau băltoace de murdărie, resturi sau obiecte lăsate (moloz, cartoane, saci), buruieni la stâlp sau la bordură, coș plin peste margine, con răsturnat sau lipsă, afișe lipite pe stâlpul de stație, în veceu: podea murdară, pisoare sau vase murdare, lipsă hârtie, coș plin.

Scrie problemele scurt, în română, câte una pe element (ex: „praf și nisip pe pavaj la bordură”, „buruieni la baza stâlpului”, „con răsturnat lângă stâlp”). Descrierea: o propoziție cu ce se vede. Răspunzi doar în formatul JSON cerut.`;

const ZONE_TASK: Record<CleaningZone, string> = {
  PERON:
    'Zona cerută: PERON (parcarea cu pavele din fața clădirii portocalii, locul microbuzelor). Verifică pavajul, coșurile, obiectele lăsate. Confirmă în descriere dacă un microbuz TRANSLUX stă pe loc și, dacă se vede, numărul lui.',
  PIETONI:
    'Zona cerută: ZONA PIETONI (trotuarul de la stația „GARA”, cu stâlpul, conurile portocalii și bordura spre stradă). Aici trec călătorii: caută explicit mucuri la stâlp și la bordură, praf sau pietriș adus de pe stradă, buruieni la stâlp și la bordură, conuri răsturnate, resturi lângă magazine, afișe pe stâlp.',
  VECEU:
    'Zona cerută: ZONA VECEU (toaleta de la peron). Verifică podeaua, cabinele, pisoarele, chiuvetele, coșul de gunoi, prezența hârtiei. Reperele exterioare ale peronului nu se aplică aici: loc_corect=false doar dacă poza nu arată deloc o toaletă.',
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['loc_corect', 'verdict', 'probleme', 'descriere'],
  properties: {
    loc_corect: { type: 'boolean', description: 'Poza arată zona cerută de la peronul TRANSLUX Chișinău' },
    verdict: { type: 'string', enum: ['CURAT', 'MURDAR'] },
    probleme: { type: 'array', items: { type: 'string' }, description: 'Goală dacă e curat' },
    descriere: { type: 'string' },
  },
} as const;

interface ModelAnswer {
  loc_corect: boolean;
  verdict: 'CURAT' | 'MURDAR';
  probleme: string[];
  descriere: string;
}

export interface CleaningResult {
  verdict: CleaningVerdict;
  problems: string[];
  description: string;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/** Judecă o poză. Nu aruncă: orice eșec devine EROARE (poza rămâne pentru admin). */
export async function analyzeCleaningPhoto(zone: CleaningZone, jpegBase64: string): Promise<CleaningResult> {
  const c = anthropic();
  if (!c) {
    console.warn('[cleaning] ANTHROPIC_API_KEY lipsește — verdict EROARE');
    return { verdict: 'EROARE', problems: [], description: 'Verificarea automată nu este configurată.' };
  }
  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            { type: 'text', text: ZONE_TASK[zone] },
          ],
        },
      ],
    });
    if (res.stop_reason === 'refusal') {
      return { verdict: 'EROARE', problems: [], description: 'Modelul a refuzat evaluarea.' };
    }
    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text) as ModelAnswer;
    if (!parsed.loc_corect) {
      return { verdict: 'ALT_LOC', problems: [], description: parsed.descriere ?? '' };
    }
    return {
      verdict: parsed.verdict === 'MURDAR' ? 'MURDAR' : 'CURAT',
      problems: Array.isArray(parsed.probleme) ? parsed.probleme.filter((p) => typeof p === 'string') : [],
      description: parsed.descriere ?? '',
    };
  } catch (err) {
    console.error('[cleaning] analiza a eșuat:', err);
    return { verdict: 'EROARE', problems: [], description: 'Verificarea automată a eșuat.' };
  }
}

/** Descarcă poza din Telegram (file_path de la getFile) ca Buffer. */
async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram file download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export interface CleaningBufferInput {
  checkDate: string;
  slot: CleaningSlot;
  zone: CleaningZone;
  jpeg: Buffer;
  userId: string;
  source: ReportSource;
  /** Telegram: file_id-ul pozei; aplicația nu are așa ceva → '' (coloana e not null). */
  telegramFileId?: string;
  lat?: number | null;
  lon?: number | null;
}

/**
 * Pasul comun pentru o poză deja în memorie (din Telegram sau din aplicație):
 * urcă în Storage, judecă, scrie linia în peron_cleaning_checks. Nu aruncă la
 * upload eșuat (verdictul contează); aruncă dacă insert-ul pică.
 */
export async function checkCleaningBuffer(input: CleaningBufferInput): Promise<CleaningResult> {
  const storageKey = `curatenie/${input.checkDate}/${input.slot}/${input.zone}-${Date.now()}.jpg`;
  await uploadReportPhoto(storageKey, input.jpeg);

  const result = await analyzeCleaningPhoto(input.zone, input.jpeg.toString('base64'));

  await createCleaningCheck({
    check_date: input.checkDate,
    slot: input.slot,
    zone: input.zone,
    storage_key: storageKey,
    telegram_file_id: input.telegramFileId ?? '',
    verdict: result.verdict,
    problems: result.problems,
    description: result.description,
    model: MODEL,
    created_by_user: input.userId,
    // Botul nu trimite source/coordonate (default-urile din DB); aplicația le trimite.
    ...(input.source === 'app'
      ? { source: 'app' as const, location_lat: input.lat ?? null, location_lon: input.lon ?? null }
      : {}),
  });

  return result;
}

/**
 * Pasul complet pentru o poză din bot: descarcă din Telegram, apoi
 * checkCleaningBuffer cu source 'bot'. Rulează în conversation.external().
 */
export async function processCleaningPhoto(input: {
  checkDate: string;
  slot: CleaningSlot;
  zone: CleaningZone;
  telegramFileId: string;
  telegramFilePath: string;
  userId: string;
}): Promise<CleaningResult> {
  const jpeg = await downloadTelegramFile(input.telegramFilePath);
  return checkCleaningBuffer({
    checkDate: input.checkDate,
    slot: input.slot,
    zone: input.zone,
    jpeg,
    userId: input.userId,
    source: 'bot',
    telegramFileId: input.telegramFileId,
  });
}
