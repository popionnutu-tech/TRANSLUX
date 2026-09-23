// Tool-urile asistentului de pe site = tool-urile agentului de pe 060401010.
//
// Se cheamă prin HTTP, pe aceleași rute /api/voice-tools/*, nu prin import: fiecare
// rută își ține porțile (numele obligatoriu, identificarea șoferului, grupa
// «Межгород», limitele) în handler. Un al doilea drum spre aceeași bază ar trebui
// ținut în pas cu primul la fiecare regulă nouă a lui Ion — și n-ar fi.
//
// conversation_id NU e al modelului: îl pune serverul, din conversația site-ului.

import type Anthropic from '@anthropic-ai/sdk';
import { voiceResultToText, formatPhone } from './voice-to-text';
import { claimLostItemForGroup, releaseLostItemClaim } from '@/lib/voice/lost-items';
import { getComplaintSummary } from '@/lib/voice/complaints';
import { driversGroupChatId, formatLostItemForGroup, notifyDriversGroup } from '@/lib/voice/drivers-group';
import { normalizePhone } from '@/lib/voice/phone';
import { tripsOnRoad, busLocation } from './bus-location';
import { busCard, pickCard, stationCard, tripsCard, type Card } from './cards';

const LOC = 'Numele localității în română (ex. «Chișinău», «Bălți»).';
const DAY = 'Ziua, cum a spus-o clientul: «azi», «mâine», «ieri», «sâmbătă» sau data (ex. «25.09»). Serverul o rezolvă.';

export const SITE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_trips',
    description: 'Cursele TRANSLUX dintre două localități într-o zi: orele de plecare, prețul, șoferul și numărul lui. Cu departure = ora exactă întoarce o singură cursă, cu fraza despre șofer.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: LOC },
        to: { type: 'string', description: LOC },
        date: { type: 'string', description: DAY },
        departure: { type: 'string', description: 'Ora exactă a plecării, HH:MM — doar când clientul vrea o cursă anume.' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_schedule',
    description: 'Orarul general (orele de plecare) pe o direcție, fără o zi anume.',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string', description: LOC }, to: { type: 'string', description: LOC } },
    },
  },
  {
    name: 'get_price',
    description: 'Prețul biletului între două localități, în MDL, și oferta activă dacă există.',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string', description: LOC }, to: { type: 'string', description: LOC } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_offers',
    description: 'Ofertele (prețurile reduse) active acum.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_company_info',
    description: 'Date fixe despre TRANSLUX: bagaj, copii, anulare, program, adresele stațiilor.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'find_past_trip',
    description: 'LUCRURI UITATE: identifică șoferul unei curse trecute, ca clientul să-l sune. Numele clientului e obligatoriu.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: LOC },
        to: { type: 'string', description: LOC },
        date: { type: 'string', description: DAY },
        departure: { type: 'string', description: 'Ora plecării, HH:MM, dacă o știe.' },
        plate: { type: 'string', description: 'Numărul mașinii, dacă îl știe.' },
        driver_name: { type: 'string', description: 'Numele șoferului, dacă îl știe.' },
        caller_name: { type: 'string', description: 'Numele clientului.' },
      },
    },
  },
  {
    name: 'trimite_lucrul_uitat_soferilor',
    description: 'Lucru uitat cu cursa neidentificată sau nesigură: trimite cursa și numărul clientului în grupa șoferilor, ca cine o recunoaște să-l sune. DOAR după find_past_trip, cu numărul dat de client. O singură dată pe conversație.',
    input_schema: {
      type: 'object',
      properties: { phone: { type: 'string', description: 'Numărul de telefon al clientului, cum l-a scris.' } },
      required: ['phone'],
    },
  },
  {
    name: 'register_complaint',
    description: 'Înregistrează o reclamație. Se cheamă din nou cu detaliile noi cât timp rezultatul cere ceva (need_more).',
    input_schema: {
      type: 'object',
      properties: {
        complaint: { type: 'string', description: 'Ce s-a întâmplat, cu vorbele clientului.' },
        complaint_type: { type: 'string', description: 'Codul din lista închisă din instrucțiuni.' },
        caller_name: { type: 'string', description: 'Numele clientului (sau «refuză să spună»).' },
        stated_phone: { type: 'string', description: 'Numărul clientului, dacă l-a dat.' },
        from: { type: 'string', description: LOC },
        to: { type: 'string', description: LOC },
        date: { type: 'string', description: DAY },
        departure: { type: 'string', description: 'Ora plecării, HH:MM.' },
        plate: { type: 'string', description: 'Numărul mașinii.' },
        driver_name: { type: 'string', description: 'Numele șoferului.' },
        no_more_details: { type: 'boolean', description: 'true când clientul spune că nu mai știe nimic.' },
      },
      required: ['complaint'],
    },
  },
  {
    name: 'curse_pe_drum',
    description: 'UNDE E AUTOBUZUL, pasul 1: cursele interurbane de AZI de pe o direcție care sunt ACUM pe drum, după grafic. Clientul își alege cursa din lista afișată sub mesaj.',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string', description: LOC }, to: { type: 'string', description: LOC } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'unde_e_autobuzul',
    description: 'UNDE E AUTOBUZUL, pasul 2: punctul de acum al autobuzului UNEI curse de azi (ora plecării clientului din localitatea lui). Doar cât cursa e pe drum după grafic. Harta apare sub mesaj.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: LOC },
        to: { type: 'string', description: LOC },
        departure: { type: 'string', description: 'Ora cursei, HH:MM.' },
      },
      required: ['from', 'to', 'departure'],
    },
  },
  {
    name: 'arata_statia',
    description: 'Arată sub mesaj cardul stației cu adresa și butoanele Google Maps și Waze.',
    input_schema: {
      type: 'object',
      properties: { statie: { type: 'string', enum: ['chisinau', 'balti'], description: 'Care stație.' } },
      required: ['statie'],
    },
  },
];

const ENDPOINT: Record<string, string> = {
  search_trips: 'search-trips',
  get_schedule: 'get-schedule',
  get_price: 'get-price',
  get_offers: 'get-offers',
  get_company_info: 'get-company-info',
  find_past_trip: 'find-past-trip',
  register_complaint: 'register-complaint',
};

// Tool-urile care scriu în dosarul conversației primesc id-ul de la server.
const NEEDS_CONVERSATION = new Set(['find_past_trip', 'register_complaint']);

export interface ToolContext {
  baseUrl: string;
  conversationId: string;
}

async function callVoiceTool(ctx: ToolContext, name: string, input: Record<string, unknown>): Promise<unknown> {
  const apiKey = process.env.VOICE_API_KEY;
  if (!apiKey) return { error: 'tool indisponibil' };
  // Ce a scris modelul trece, dar conversation_id îl suprascrie serverul — altfel un
  // client ar putea lipi reclamația lui de dosarul altei conversații.
  const { conversation_id: _ignored, caller_phone: _ignored2, ...clean } = input;
  void _ignored; void _ignored2;
  const body = NEEDS_CONVERSATION.has(name) ? { ...clean, conversation_id: ctx.conversationId } : clean;
  try {
    const res = await fetch(`${ctx.baseUrl}/api/voice-tools/${ENDPOINT[name]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-voice-api-key': apiKey },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data === null) return { error: `tool ${name} indisponibil acum` };
    return voiceResultToText(data);
  } catch (err) {
    console.error(`site-assistant tool ${name}:`, (err as Error).message);
    return { error: `tool ${name} indisponibil acum` };
  }
}

/**
 * Lucrul uitat pleacă în grupa șoferilor. La telefon asta face webhook-ul de la
 * sfârșitul apelului (voice-webhook `raporteaza`); pe site nu există «sfârșit de
 * apel», deci pleacă atunci când clientul și-a dat numărul. Aceeași revendicare
 * condiționată ca acolo: a doua chemare nu mai trimite nimic.
 */
async function sendLostItem(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const raw = typeof input.phone === 'string' ? input.phone.slice(0, 40) : '';
  const phone = normalizePhone(raw);
  if (!formatPhone(phone)) {
    return { need_more: true, result_ro: 'Numărul nu arată ca un număr din Moldova. Cere clientului numărul corect (ex. 069 123 456).', result_ru: 'Номер не похож на молдавский. Попроси клиента правильный номер (например 069 123 456).' };
  }
  if ((await driversGroupChatId()) === null) {
    return { sent: false, result_ro: 'Transmiterea către șoferi nu merge acum. Spune-i clientului să sune la 060 401 010.', result_ru: 'Передача водителям сейчас не работает. Скажи клиенту позвонить на 060 401 010.' };
  }
  const item = await claimLostItemForGroup(ctx.conversationId);
  if (!item) {
    return { sent: false, result_ro: 'Nu există un lucru uitat notat în conversație (chemă întâi find_past_trip cu ruta și ziua) sau a fost deja trimis.', result_ru: 'В разговоре нет записанной забытой вещи (сначала find_past_trip с маршрутом и днём) или она уже отправлена.' };
  }
  const complaint = await getComplaintSummary(ctx.conversationId).catch(() => null);
  const ok = await notifyDriversGroup(
    formatLostItemForGroup({ ...item, caller_phone: formatPhone(phone) }, complaint !== null),
  ).catch(() => false);
  if (!ok) {
    await releaseLostItemClaim(ctx.conversationId);
    return { sent: false, result_ro: 'Nu am putut trimite acum. Spune-i clientului să sune la 060 401 010.', result_ru: 'Сейчас не получилось отправить. Скажи клиенту позвонить на 060 401 010.' };
  }
  return {
    sent: true,
    line_ro: 'Am transmis cursa șoferilor împreună cu numărul dumneavoastră. Cine își recunoaște cursa vă sună.',
    line_ru: 'Я передал данные рейса водителям вместе с вашим номером. Кто узнает свой рейс, позвонит вам.',
  };
}

export interface ToolOutcome {
  /** Ce citește modelul. */
  result: unknown;
  /** Ce desenează widget-ul sub mesaj — construit din date, nu de model. */
  card?: Card | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : '');

export async function executeSiteTool(ctx: ToolContext, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  try {
    switch (name) {
      case 'trimite_lucrul_uitat_soferilor':
        return { result: await sendLostItem(ctx, input) };
      case 'curse_pe_drum': {
        const r = await tripsOnRoad(str(input.from), str(input.to));
        return { result: r.result, card: r.fromRo && r.toRo ? pickCard(r.fromRo, r.toRo, r.trips) : null };
      }
      case 'unde_e_autobuzul': {
        const r = await busLocation(str(input.from), str(input.to), str(input.departure));
        return { result: r.result, card: r.point ? busCard(r.point) : null };
      }
      case 'arata_statia': {
        const card = stationCard(str(input.statie));
        return { result: card ? { shown: true } : { error: 'stație necunoscută' }, card };
      }
    }
    if (!ENDPOINT[name]) return { result: { error: `tool necunoscut: ${name}` } };
    const result = await callVoiceTool(ctx, name, input);
    return { result, card: name === 'search_trips' ? await tripsCard(input, result).catch(() => null) : null };
  } catch (err) {
    console.error(`site-assistant tool ${name}:`, (err as Error).message);
    return { result: { error: `tool ${name} indisponibil acum` } };
  }
}
