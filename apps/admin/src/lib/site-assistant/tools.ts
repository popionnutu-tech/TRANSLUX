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
import { configPublica } from '@/lib/bilete/public';
import { garantieLansareActiva } from '@/lib/bilete/refund';
import { GRILA_RESTITUIRE } from '@/lib/bilete/refund-reguli';
import { gasesteBilete } from '@/lib/bilete/sms';
import { confirmaAnulare, ofertaAnulare } from '@/lib/bilete/anulare-site';

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
  // Fără get_schedule: pe 23.09 a dat «din Briceni prima la 11:15» (orele cursei
  // DINSPRE Chișinău prin Briceni), iar căutarea site-ului dă 03:20. Orarul vine
  // doar din search_trips — același motor ca pe translux.md.
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
  // Biletele online (Ion, 10.10.2026: «asistentul AI de pe site să poată ajuta tot ce este legat de bilete online, până
  // și găsirea biletului»; «anularea … și din asistentul online, dacă se identifică clientul»).
  {
    name: 'bilete_online',
    description: 'Regulile și starea de acum a biletelor online: unde se vând, promoțiile (tur-retur, student), grila de returnare, garanția. Chemi înainte de orice răspuns despre cumpărarea, promoțiile sau returnarea biletului online.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'gaseste_biletul',
    description: '«Găsește biletul meu»: trimite prin SMS, pe telefonul dat, linkurile biletelor viitoare cumpărate cu el. Nu arată nimic în chat.',
    input_schema: {
      type: 'object',
      properties: { phone: { type: 'string', description: 'Telefonul cu care s-a cumpărat biletul, cum l-a scris clientul.' } },
      required: ['phone'],
    },
  },
  {
    name: 'anuleaza_bilet',
    description: 'Anularea biletului online cu returnarea banilor pe card. Întâi fără confirma (afli suma), apoi, după «da» clar al clientului, cu confirma = true și suma aflată. Clientul se identifică prin linkul biletului (sau codul din link) + ultimele 4 cifre ale telefonului din comandă.',
    input_schema: {
      type: 'object',
      properties: {
        link: { type: 'string', description: 'Linkul biletului (translux.md/ro/bilet/…) sau codul de 32 de caractere din el, exact cum l-a lipit clientul.' },
        cifre: { type: 'string', description: 'Ultimele 4 cifre ale telefonului din comandă.' },
        confirma: { type: 'boolean', description: 'true doar după ce clientul a văzut suma și a spus clar că vrea anularea.' },
        suma: { type: 'number', description: 'Suma aflată la pasul fără confirmare (obligatorie cu confirma = true).' },
      },
      required: ['link', 'cifre'],
    },
  },
  {
    name: 'arata_statia',
    description: 'Arată sub mesaj cardul stației cu adresa și butoanele Google Maps și Waze.',
    input_schema: {
      type: 'object',
      properties: { statie: { type: 'string', enum: ['chisinau', 'balti', 'edinet', 'briceni'], description: 'Care stație.' } },
      required: ['statie'],
    },
  },
];

const ENDPOINT: Record<string, string> = {
  search_trips: 'search-trips',
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
  /** Amprenta IP-ului (plafoanele «Găsește biletul»); lipsă → id-ul conversației. */
  ipHash?: string;
  locale?: 'ro' | 'ru';
}

async function bileteOnline() {
  const [cfg, garantie] = await Promise.all([configPublica(), garantieLansareActiva()]);
  return {
    vanzare_activa: cfg.activ,
    localitati_cu_bilet_online: cfg.localitati, destinatii: cfg.destinatii, din_data: cfg.localitati_de_la,
    cum_se_cumpara_ro: 'Pe translux.md: alegi de unde, unde și ziua (Acum / Mai târziu), apeși «Cumpără» la cursă; la cursele din Chișinău alegi locul pe harta autobuzului (din nord locul se dă la urcare); scrii numele, prenumele, telefonul (e-mailul e opțional), bifezi acordul și plătești cu cardul (Visa/Mastercard) pe pagina băncii maib. Biletul cu cod QR apare imediat pe pagina biletului, pe e-mail (dacă l-ai lăsat) și în botul Telegram (butonul «Salvează în Telegram»). Codul QR îl arăți șoferului la urcare.',
    plata_esuata_ro: 'Dacă plata nu trece, pe pagina biletului și pe prima pagină apare «Reia plata»: alegerea e păstrată 30 de minute.',
    promotii: cfg.promo.activ ? {
      doar_pe: 'Bălți ⇄ Chișinău, la cumpărarea online', pct: cfg.promo.pct,
      tur_retur_ro: `Tur-retur: comutatorul «Tur-retur −${cfg.promo.pct}%» din căutare; returul e cu ${cfg.promo.pct}% mai ieftin, în cel mult ${cfg.promo.retur_zile} zile după tur, pe altă cursă, o singură plată; se anulează doar împreună, până la plecarea turului.`,
      student_ro: `Student −${cfg.promo.pct}%: comutatorul «Student» din căutare cere întâi verificarea: poza carnetului (universitate sau colegiu din Moldova, vizat pe anul universitar de acum) și a buletinului/pașaportului; verificarea e automată, în câteva secunde; un loc pe bilet; carnetul se arată șoferului. Nu se cumulează cu tur-retur.`,
    } : null,
    returnare: {
      unde_ro: 'Biletul se anulează: pe pagina biletului («Anulează biletul»), în botul Telegram («Returnează biletul») sau aici, în chat (cu linkul biletului și ultimele 4 cifre ale telefonului). Banii se întorc pe cardul cu care s-a plătit.',
      garantie_lansare_activa: garantie,
      garantie_ro: garantie ? 'Acum e garanția de lansare: biletul nefolosit se returnează integral, până la 24 de ore după plecare.' : null,
      grila_ore_inainte_de_plecare: GRILA_RESTITUIRE.map((g) => ({ minim_ore: g.minOreInainte, parte: `${g.noimi}/9 din preț` })),
      sub_4_ore_ro: 'Cu mai puțin de 4 ore înainte de plecare biletul nu se mai returnează (afară de garanția de lansare).',
    },
    gaseste_biletul_ro: 'Linkul biletului vine după plată (pagina, e-mailul, Telegram). Pierdut? «Găsește biletul meu» pe translux.md: linkurile vin prin SMS pe telefonul din comandă — sau tool-ul gaseste_biletul.',
  };
}

const COD_DIN_LINK = /([0-9a-f]{32})/i;

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
    return { sent: false, result_ro: 'Transmiterea către șoferi nu merge acum. Spune-i clientului să sune la +373 60 401 010.', result_ru: 'Передача водителям сейчас не работает. Скажи клиенту позвонить на +373 60 401 010.' };
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
    return { sent: false, result_ro: 'Nu am putut trimite acum. Spune-i clientului să sune la +373 60 401 010.', result_ru: 'Сейчас не получилось отправить. Скажи клиенту позвонить на +373 60 401 010.' };
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
      case 'bilete_online':
        return { result: await bileteOnline() };
      case 'gaseste_biletul': {
        const r = await gasesteBilete(str(input.phone), ctx.ipHash ?? ctx.conversationId, ctx.locale ?? 'ro');
        return { result: r.ok
          ? { result_ro: 'Dacă pe acest număr sunt bilete viitoare, SMS-ul cu linkurile vine în câteva secunde.', result_ru: 'Если на этом номере есть будущие билеты, SMS со ссылками придёт через несколько секунд.' }
          : r.motiv === 'neconfigurat'
            ? { result_ro: 'Trimiterea prin SMS pornește în curând. Până atunci linkul biletului e în e-mailul de după plată și în botul Telegram, dacă l-ai salvat acolo.', result_ru: 'Отправка по SMS скоро заработает. Пока ссылка на билет есть в письме после оплаты и в Telegram-боте, если вы его сохранили.' }
            : r.motiv === 'plafon'
              ? { result_ro: 'Prea multe cereri de pe acest număr. Încearcă peste o oră.', result_ru: 'Слишком много запросов с этого номера. Попробуйте через час.' }
              : { result_ro: 'Numărul nu pare corect. Cere-i clientului telefonul cu care a cumpărat.', result_ru: 'Номер выглядит неверно. Попросите номер, с которого покупали.' } };
      }
      case 'anuleaza_bilet': {
        const cod = COD_DIN_LINK.exec(str(input.link))?.[1]?.toLowerCase() ?? '';
        const cifre = str(input.cifre).replace(/\D/g, '').slice(-4);
        if (!cod) return { result: { error: 'Nu văd codul biletului în ce a scris clientul. Cere-i linkul biletului (din e-mail, SMS sau pagina biletului).' } };
        if (cifre.length !== 4) return { result: { error: 'Cere-i clientului ultimele 4 cifre ale telefonului din comandă.' } };
        const r = input.confirma === true ? await confirmaAnulare(cod, cifre, input.suma, 'asistent') : await ofertaAnulare(cod, cifre);
        return { result: r };
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
