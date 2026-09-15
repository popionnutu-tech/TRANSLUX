// Statistica săptămânală a agentului vocal (Ion, 15.09: «am nevoie doar statistica
// săptămânală de sunete, câte sunete agentul a dat în bară și nu a putut rezolva»).
//
// Până acum fiecare apel pleca în Telegram ca raport separat — ≈180 de mesaje pe
// săptămână, din care Ion nu putea scoate niciun număr. Raportul pe apel a ieșit din
// webhook; aici se face numărătoarea, o dată pe săptămână.
//
// Rezultatul apelului NU se ia din `analysis.call_successful` al ElevenLabs: acela
// scrie «success» la 174 din 175 de apeluri, inclusiv la cele în care clientul a spus
// «alo?» de trei ori și a închis. Se citește din urme — funcția SQL
// voice_apeluri_rezultat (migr. 352) — iar găleata pe care urmele n-o pot judeca
// (`fara_tool`: agentul a vorbit fără să cheme niciun instrument) o desparte Haiku
// după rezumatul apelului.
import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '@/lib/supabase';
import { alertAdmins, escapeHtml } from '@/lib/telegram-notify';
import { tgCut } from '@/lib/voice-exams';
import { chisinauTodayIso, chisinauDayStartIso, chisinauDayOf, chisinauTimeOf } from '@/lib/chisinau-time';

export const BUCKETS = [
  'mut', 'operator', 'lucru_uitat_gasit', 'lucru_uitat_negasit',
  'reclamatie', 'orar', 'localitate', 'fara_curse', 'fara_tool',
] as const;
export type Bucket = (typeof BUCKETS)[number];

export interface ApelRezultat {
  conversation_id: string;
  created_at: string;
  caller_phone: string | null;
  duration_secs: number | null;
  summary: string | null;
  bucket: Bucket;
}

/** Ce s-a ales din apelul în care agentul n-a chemat niciun instrument. */
export type VerdictFaraTool = 'inchis_imediat' | 'raspuns_corect' | 'ratat' | 'neclasificat';
export interface Verdict { verdict: VerdictFaraTool; motiv: string }

// Câte apeluri `fara_tool` judecă modelul într-o rulare. Media e 41/săptămână;
// capul de 90 ține invocarea sub peretele de 60 s al Hobby și la o săptămână de vârf.
const MAX_CLASIFICARI = 90;
const CONCURENTA = 6;
const BUGET_MS = 35_000;

// ── Fereastra: săptămâna încheiată, luni→duminică, în ora Chișinăului ──────────

function adunaZile(zi: string, n: number): string {
  const d = new Date(`${zi}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Ultima săptămână ÎNCHEIATĂ față de ziua dată (luni–duminică).
 * Rulat lunea, dă săptămâna care tocmai s-a terminat; rulat miercuri (prima
 * încercare a picat), dă aceeași săptămână — de asta paza e pe cheia săptămânii,
 * nu pe «am trimis acum 6 zile».
 */
export function saptamanaIncheiata(azi: string): { start: string; sfarsit: string } {
  const zi = new Date(`${azi}T00:00:00Z`).getUTCDay(); // 0 = duminică
  const panaLuni = zi === 0 ? 6 : zi - 1;
  const start = adunaZile(azi, -panaLuni - 7);
  return { start, sfarsit: adunaZile(start, 6) };
}

const zl = (zi: string) => `${zi.slice(8, 10)}.${zi.slice(5, 7)}`;
export const etichetaPerioadei = (start: string, sfarsit: string) => `${zl(start)} — ${zl(sfarsit)}`;

// ── Verdictul pe apelurile fără instrument ────────────────────────────────────

const SISTEM = `Ești auditor de apeluri la TRANSLUX, companie de transport de pasageri din Moldova (rutele Chișinău–Bălți–nordul Moldovei). Primești rezumatul unui apel în care agentul vocal NU a chemat niciun instrument: n-a căutat curse, n-a dat preț, n-a înregistrat reclamație, n-a căutat un lucru uitat. Spune ce s-a întâmplat:
- "inchis_imediat" — clientul nu a apucat să spună ce vrea: doar «alo», tăcere, linie proastă, a închis, a întrebat dacă vorbește cu un robot.
- "raspuns_corect" — clientul a cerut ceva ce compania NU face (taxi, marfă, colete, angajare) sau o localitate din afara rețelei (Iași, Botoșani, Cernăuți, Cahul, Comrat, orice din altă țară ori din sudul Moldovei), iar agentul i-a spus asta. Rămâne "raspuns_corect" și dacă agentul a mai întrebat o dată ca să se lămurească.
- "ratat" — clientul a cerut ceva ce compania FACE (orar, preț, loc în autobuz, numărul șoferului, reclamație, lucru uitat, pe rutele Chișinău–Bălți–nord) și a rămas fără răspuns: agentul nu a înțeles, nu a căutat, a ocolit întrebarea.
Răspunde DOAR JSON: {"verdict":"inchis_imediat"|"raspuns_corect"|"ratat","motiv":"<cel mult 10 cuvinte, în română, cu literă mică, ce a cerut clientul și ce a primit>"}`;

export function parseVerdict(raw: string): Verdict | null {
  try {
    const p = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const v = String(p.verdict ?? '');
    if (v !== 'inchis_imediat' && v !== 'raspuns_corect' && v !== 'ratat') return null;
    return { verdict: v, motiv: String(p.motiv ?? '').trim().slice(0, 120) };
  } catch {
    return null;
  }
}

async function clasifica(anthropic: Anthropic, apel: ApelRezultat): Promise<Verdict | null> {
  // Fără rezumat nu e ce judeca: EL îl scrie la fiecare apel, dar un webhook
  // căzut la mijloc poate lăsa rândul gol.
  if (!apel.summary) return null;
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: SISTEM,
      messages: [{ role: 'user', content: `Durata apelului: ${apel.duration_secs ?? '?'} s.\nREZUMAT:\n${apel.summary.slice(0, 2000)}` }],
    }, { signal: AbortSignal.timeout(20_000) });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseVerdict(text);
  } catch {
    return null;
  }
}

export async function clasificaFaraTool(
  apeluri: ApelRezultat[],
  deadline: number,
): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>();
  const coada = apeluri.filter((a) => a.bucket === 'fara_tool').slice(0, MAX_CLASIFICARI);
  if (coada.length === 0) return out;
  const anthropic = new Anthropic({ maxRetries: 1 });
  for (let i = 0; i < coada.length; i += CONCURENTA) {
    if (Date.now() > deadline) break; // restul rămâne «neclasificat», și se vede în raport
    const grup = coada.slice(i, i + CONCURENTA);
    const rez = await Promise.allSettled(grup.map((a) => clasifica(anthropic, a)));
    for (let j = 0; j < rez.length; j++) {
      const r = rez[j];
      if (r.status === 'fulfilled' && r.value) out.set(grup[j].conversation_id, r.value);
    }
  }
  return out;
}

// ── Raportul ──────────────────────────────────────────────────────────────────

/** Numele în română al regulii pe care judecătorul de noapte a prins-o. */
export const REGULI_RO: Record<string, string> = {
  coridor_refuz: 'a refuzat o rută pe care o avem',
  neaga_curse: 'a spus că nu sunt curse, deși erau',
  lucru_uitat: 'a dat numărul unui șofer nepotrivit',
  promite_callback: 'a promis că sunăm noi înapoi',
  zi_gresita: 'a spus altă zi decât cea găsită',
  pret_gresit: 'a spus alt preț decât cel real',
};

export interface RaportInput {
  perioada: string;
  apeluri: ApelRezultat[];
  verdicte: Map<string, Verdict>;
  /** Lecțiile judecătorului de noapte din aceeași săptămână, fără cele respinse de Ion. */
  lectii: { rule: string }[];
}

const MAX_LISTA = 12;

/** Verdictul folosit la numărătoare: apelul netrecut prin model nu se pierde. */
function verdictul(apel: ApelRezultat, verdicte: Map<string, Verdict>): VerdictFaraTool {
  return verdicte.get(apel.conversation_id)?.verdict ?? 'neclasificat';
}

/** Motivul scurt, pentru lista de la coada raportului. */
function motivul(apel: ApelRezultat, verdicte: Map<string, Verdict>): string {
  switch (apel.bucket) {
    case 'localitate': return 'n-a recunoscut localitatea cerută';
    case 'lucru_uitat_negasit': return 'lucru uitat, cursa nu s-a identificat';
    case 'operator': return 'clientul a cerut un om';
    default: return verdicte.get(apel.conversation_id)?.motiv || 'a rămas fără răspuns';
  }
}

export function compuneRaport({ perioada, apeluri, verdicte, lectii }: RaportInput): string {
  const n = (b: Bucket) => apeluri.filter((a) => a.bucket === b).length;
  const nv = (v: VerdictFaraTool) =>
    apeluri.filter((a) => a.bucket === 'fara_tool' && verdictul(a, verdicte) === v).length;

  const rezolvate = n('orar') + n('reclamatie') + n('lucru_uitat_gasit') + nv('raspuns_corect');
  const nerezolvateApeluri = apeluri.filter((a) =>
    a.bucket === 'localitate' || a.bucket === 'lucru_uitat_negasit' || a.bucket === 'operator'
    || (a.bucket === 'fara_tool' && verdictul(a, verdicte) === 'ratat'));
  const fara = n('mut') + nv('inchis_imediat') + n('fara_curse') + nv('neclasificat');

  const rand = (eticheta: string, cat: number) => (cat > 0 ? [`• ${eticheta}: ${cat}`] : []);
  const linii = [
    `📞 <b>AGENT VOCAL — ${escapeHtml(perioada)}</b>`,
    `Apeluri: <b>${apeluri.length}</b>`,
  ];

  linii.push('', `✅ <b>Rezolvate: ${rezolvate}</b>`);
  linii.push(
    ...rand('orar sau preț', n('orar')),
    ...rand('reclamații înregistrate', n('reclamatie')),
    ...rand('lucruri uitate, șofer găsit', n('lucru_uitat_gasit')),
    ...rand('întrebări în afara rețelei, răspuns corect', nv('raspuns_corect')),
  );

  linii.push('', `❌ <b>N-a putut rezolva: ${nerezolvateApeluri.length}</b>`);
  if (nerezolvateApeluri.length === 0) {
    linii.push('• niciunul');
  } else {
    linii.push(
      ...rand('n-a înțeles ce vrea clientul', nv('ratat')),
      ...rand('localitate nerecunoscută', n('localitate')),
      ...rand('lucru uitat, cursa neidentificată', n('lucru_uitat_negasit')),
      ...rand('clientul a cerut un om', n('operator')),
    );
  }

  if (fara > 0) {
    linii.push('', `➖ <b>Fără răspuns de dat: ${fara}</b>`);
    linii.push(
      ...rand('clientul n-a spus nimic (alo, tăcere)', n('mut') + nv('inchis_imediat')),
      ...rand('fără curse la data cerută', n('fara_curse')),
      ...rand('neclasificate (modelul n-a apucat)', nv('neclasificat')),
    );
  }

  if (lectii.length > 0) {
    const peRegula = new Map<string, number>();
    for (const l of lectii) peRegula.set(l.rule, (peRegula.get(l.rule) ?? 0) + 1);
    linii.push('', `🔎 <b>Greșeli prinse de judecător: ${lectii.length}</b>`);
    for (const [regula, cat] of [...peRegula.entries()].sort((a, b) => b[1] - a[1])) {
      linii.push(`• ${escapeHtml(REGULI_RO[regula] ?? regula)}: ${cat}`);
    }
  }

  if (nerezolvateApeluri.length > 0) {
    const capat = nerezolvateApeluri.length > MAX_LISTA ? ` (primele ${MAX_LISTA} din ${nerezolvateApeluri.length})` : '';
    linii.push('', `<b>Apelurile nerezolvate</b>${capat}:`);
    for (const a of nerezolvateApeluri.slice(0, MAX_LISTA)) {
      const cand = `${zl(chisinauDayOf(a.created_at))} ${chisinauTimeOf(a.created_at)}`;
      const tel = a.caller_phone ? escapeHtml(a.caller_phone) : 'număr necunoscut';
      linii.push(`• ${cand} · ${tel} — ${escapeHtml(motivul(a, verdicte))}`);
    }
  }

  return tgCut(linii.join('\n'));
}

// ── Rularea ───────────────────────────────────────────────────────────────────

export interface RezultatRulare {
  trimis: boolean;
  motiv?: 'deja_trimis' | 'fara_apeluri' | 'telegram_esuat';
  saptamana?: string;
  apeluri?: number;
  clasificate?: number;
}

/**
 * O singură dată pe săptămână: rândul de pază se scrie DUPĂ trimiterea confirmată,
 * ca un Telegram căzut să fie reîncercat de rularea de mâine (workflow-ul e zilnic),
 * nu peste o săptămână. Cheia e săptămâna raportată, deci reîncercarea nu dublează.
 */
export async function ruleazaStatisticaSaptamanala(t0 = Date.now()): Promise<RezultatRulare> {
  const supabase = getSupabase();
  const { start, sfarsit } = saptamanaIncheiata(chisinauTodayIso());

  const { data: deja } = await supabase.from('voice_controller_incidents')
    .select('id').eq('kind', 'voice_weekly').eq('details->>week', start).limit(1);
  if (deja?.length) return { trimis: false, motiv: 'deja_trimis', saptamana: start };

  const { data, error } = await supabase.rpc('voice_apeluri_rezultat', {
    p_from: chisinauDayStartIso(start),
    p_to: chisinauDayStartIso(adunaZile(sfarsit, 1)),
  });
  if (error) throw new Error(`voice_apeluri_rezultat failed: ${error.message}`);
  const apeluri = (data ?? []) as ApelRezultat[];
  if (apeluri.length === 0) return { trimis: false, motiv: 'fara_apeluri', saptamana: start };

  const verdicte = await clasificaFaraTool(apeluri, t0 + BUGET_MS);

  // Lecțiile judecătorului din aceeași săptămână. Respinse de Ion = nu s-a
  // întâmplat, deci nu intră la greșeli; cele neexaminate intră — codul le-a
  // verificat deja pe fapte (voice-judge), ✓-ul lui Ion e pentru promptul agentului.
  const { data: lectiiRaw } = await supabase.from('voice_lessons')
    .select('payload, status')
    .eq('kind', 'prompt_lesson').eq('payload->>source', 'judge')
    .neq('status', 'rejected')
    .gte('created_at', chisinauDayStartIso(start))
    .lt('created_at', chisinauDayStartIso(adunaZile(sfarsit, 1)));
  const lectii = ((lectiiRaw ?? []) as { payload: { rule?: string } }[])
    .map((l) => ({ rule: l.payload?.rule ?? '?' }));

  const text = compuneRaport({ perioada: etichetaPerioadei(start, sfarsit), apeluri, verdicte, lectii });
  const trimis = await alertAdmins(text);
  if (!trimis) return { trimis: false, motiv: 'telegram_esuat', saptamana: start, apeluri: apeluri.length };

  await supabase.from('voice_controller_incidents').insert({
    kind: 'voice_weekly',
    healed: true,
    details: { week: start, calls: apeluri.length, classified: verdicte.size },
  });
  return { trimis: true, saptamana: start, apeluri: apeluri.length, clasificate: verdicte.size };
}
