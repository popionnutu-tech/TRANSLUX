import { getSupabase } from '@/lib/supabase';

// ─── Constants ───

const ANTA_URL =
  'https://anta.gov.md/content/tarifele-provizorii-pentru-serviciile-regulate-de-transport';
const RATE_MIN = 0.5;
const RATE_MAX = 2.0;
const RATE_TOLERANCE = 0.001;
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000; // o propunere e valabilă 24h

const CONFIG_KEY_INTERURBAN_LONG = 'rate_per_km_long';
const CONFIG_KEY_INTERURBAN_SHORT = 'rate_per_km_interurban_short';
const CONFIG_KEY_SUBURBAN = 'rate_per_km_suburban';

const POPULAR_ROUTES = [
  { from: 'chisinau', to: 'balti', from_ro: 'Chișinău', to_ro: 'Bălți', from_ru: 'Кишинёв', to_ru: 'Бэлць' },
  { from: 'chisinau', to: 'edinet', from_ro: 'Chișinău', to_ro: 'Edineț', from_ru: 'Кишинёв', to_ru: 'Единец' },
  { from: 'chisinau', to: 'singerei', from_ro: 'Chișinău', to_ro: 'Sîngerei', from_ru: 'Кишинёв', to_ru: 'Сынжерей' },
  { from: 'chisinau', to: 'ocnita', from_ro: 'Chișinău', to_ro: 'Ocnița', from_ru: 'Кишинёв', to_ru: 'Окница' },
  { from: 'chisinau', to: 'otaci', from_ro: 'Chișinău', to_ro: 'Otaci', from_ru: 'Кишинёв', to_ru: 'Отачь' },
  { from: 'chisinau', to: 'briceni', from_ro: 'Chișinău', to_ro: 'Briceni', from_ru: 'Кишинёв', to_ru: 'Бричень' },
  { from: 'chisinau', to: 'cupcini', from_ro: 'Chișinău', to_ro: 'Cupcini', from_ru: 'Кишинёв', to_ru: 'Купчинь' },
  { from: 'chisinau', to: 'lipcani', from_ro: 'Chișinău', to_ro: 'Lipcani', from_ru: 'Кишинёв', to_ru: 'Липкань' },
  { from: 'chisinau', to: 'corjeuti', from_ro: 'Chișinău', to_ro: 'Corjeuți', from_ru: 'Кишинёв', to_ru: 'Коржеуць' },
  { from: 'chisinau', to: 'grimancauti', from_ro: 'Chișinău', to_ro: 'Grimăncăuți', from_ru: 'Кишинёв', to_ru: 'Гримэнкэуць' },
  { from: 'chisinau', to: 'criva', from_ro: 'Chișinău', to_ro: 'Criva', from_ru: 'Кишинёв', to_ru: 'Крива' },
  { from: 'chisinau', to: 'larga', from_ro: 'Chișinău', to_ro: 'Larga', from_ru: 'Кишинёв', to_ru: 'Ларга' },
];

// ─── Types ───

interface ParsedRates {
  interurbanLong: number;
  interurbanShort: number;
  suburban: number | null; // null = nu e pe pagină (ex. tarif provizoriu doar interurban) → păstrează curentul
  effectiveDate: string | null; // YYYY-MM-DD parsed from "începând cu DD.MM.YYYY"
}

interface CurrentRates {
  interurbanLong: number | null;
  interurbanShort: number | null;
  suburban: number | null;
}

interface EffectiveRates {
  interurbanLong: number;
  interurbanShort: number;
  suburban: number;
  effectiveDate: string | null;
}

export interface PriceUpdateResult {
  status: 'updated' | 'no_change' | 'proposed' | 'error';
  proposalId?: string;
  rates?: { interurbanLong: number; interurbanShort: number; suburban: number };
  previousRates?: { interurbanLong: number | null; interurbanShort: number | null; suburban: number | null };
  rowsUpdated?: number;
  baltiChisinauOffer?: number;
  period?: { start: string; end: string };
  error?: string;
}

// ─── Parsing ───

function extractConfortRate(section: string, level: 'I' | 'II'): number {
  const levelPattern = level === 'II' ? 'II' : 'I(?!I)';

  const pattern = new RegExp(
    `Categoria\\s+de\\s+confort\\s+${levelPattern}\\s*[:\\-–]?\\s*(\\d+[,.]\\d+)`,
    'i',
  );
  const match = section.match(pattern);

  if (!match) {
    throw new Error(`Could not parse confort ${level} rate from ANTA page section`);
  }

  return parseFloat(match[1].replace(',', '.'));
}

export function parseRates(html: string): ParsedRates {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  // Parse effective date from "începând cu DD.MM.YYYY" (shared by both formats).
  const datePattern = /[iî]ncep[aâ]nd\s+cu\s+(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/i;
  const dateMatch = text.match(datePattern);
  let effectiveDate: string | null = null;
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    effectiveDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // ── Format 2: tarif plafon PROVIZORIU unic (fără categorii de confort) ──
  // ANTA poate publica un singur tarif (ex. "... în trafic interraional  1,04  Prețul mediu...").
  // Îl detectăm prin ABSENȚA "Categoria de confort" și aplicăm aceeași rată pentru toate.
  if (!/Categoria\s+de\s+confort/i.test(text)) {
    // Numărul imediat după "...interraional" (evită data și "28,02 lei/litru" al motorinei).
    const flatMatch = text.match(/interr?a[tțţ]?ion\w*[^0-9]{0,40}?(\d+[.,]\d+)/i);
    if (!flatMatch) {
      const snippet = text.slice(0, 200);
      throw new Error(`Could not parse provisional flat tariff from ANTA page. Text starts with: "${snippet}"`);
    }
    const flat = parseFloat(flatMatch[1].replace(',', '.'));
    // Raionalul NU e pe pagina provizorie → suburban=null (fluxul păstrează valoarea curentă).
    return { interurbanLong: flat, interurbanShort: flat, suburban: null, effectiveDate };
  }

  // ── Format 1: tarif structurat cu categorii de confort (interurban II/I + raional) ──
  const interurbanPattern = /Trafic\s+interr?a[tțţ]?ion\w*\s(.*?)Trafic\s+ra[iî]/is;
  const interurbanMatch = text.match(interurbanPattern);

  if (!interurbanMatch) {
    const snippet = text.slice(0, 200);
    throw new Error(`Could not find interurban tariff section on ANTA page. Text starts with: "${snippet}"`);
  }

  const interurbanSection = interurbanMatch[1];
  const interurbanLong = extractConfortRate(interurbanSection, 'II');
  const interurbanShort = extractConfortRate(interurbanSection, 'I');

  const suburbanPattern = /Trafic\s+ra[iî]\w*\s(.*?)$/is;
  const suburbanMatch = text.match(suburbanPattern);

  if (!suburbanMatch) {
    const snippet = text.slice(0, 200);
    throw new Error(`Could not find suburban (raional) tariff section on ANTA page. Text starts with: "${snippet}"`);
  }

  const suburbanSection = suburbanMatch[1];
  const suburban = extractConfortRate(suburbanSection, 'I');

  return { interurbanLong, interurbanShort, suburban, effectiveDate };
}

function validateRates(rates: ParsedRates): void {
  const entries: Array<[string, number | null]> = [
    ['interurbanLong', rates.interurbanLong],
    ['interurbanShort', rates.interurbanShort],
    ['suburban', rates.suburban],
  ];

  for (const [name, value] of entries) {
    if (value === null) continue; // tarif neprezent pe pagină → se păstrează cel curent
    if (isNaN(value) || value < RATE_MIN || value > RATE_MAX) {
      throw new Error(`Parsed rate ${name}=${value} outside valid range [${RATE_MIN}, ${RATE_MAX}]`);
    }
  }
}

// ─── DB helpers ───

async function loadCurrentRates(
  supabase: ReturnType<typeof getSupabase>,
): Promise<CurrentRates> {
  const { data: rows } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', [CONFIG_KEY_INTERURBAN_LONG, CONFIG_KEY_INTERURBAN_SHORT, CONFIG_KEY_SUBURBAN]);

  const configMap = new Map(
    (rows || []).map((r: { key: string; value: string }) => [r.key, r.value]),
  );

  const parseOrNull = (key: string): number | null => {
    const raw = configMap.get(key);
    if (!raw) return null;
    const parsed = parseFloat(raw);
    return isNaN(parsed) ? null : parsed;
  };

  return {
    interurbanLong: parseOrNull(CONFIG_KEY_INTERURBAN_LONG),
    interurbanShort: parseOrNull(CONFIG_KEY_INTERURBAN_SHORT),
    suburban: parseOrNull(CONFIG_KEY_SUBURBAN),
  };
}

function hasAnyRateChanged(current: CurrentRates, parsed: ParsedRates): boolean {
  const pairs: Array<[number | null, number | null]> = [
    [current.interurbanLong, parsed.interurbanLong],
    [current.interurbanShort, parsed.interurbanShort],
    [current.suburban, parsed.suburban],
  ];

  // Tarifele null (neprezente pe pagină) nu contează ca „schimbate".
  return pairs.some(
    ([cur, next]) => next !== null && (cur === null || Math.abs(cur - next) >= RATE_TOLERANCE),
  );
}

// ─── Period computation ───

function computeTariffPeriod(effectiveDate: string | null): { periodStart: string; periodEnd: string } {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let start: Date;

  if (effectiveDate) {
    // Use the date parsed from ANTA page ("începând cu DD.MM.YYYY")
    start = new Date(effectiveDate + 'T00:00:00');
  } else {
    // Fallback: most recent Thursday (or today if Thursday)
    const chisinauNow = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }),
    );
    const dayOfWeek = chisinauNow.getDay();
    const daysSinceThursday = ((dayOfWeek - 4) % 7 + 7) % 7;
    start = new Date(chisinauNow);
    start.setDate(start.getDate() - daysSinceThursday);
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { periodStart: fmt(start), periodEnd: fmt(end) };
}

// ─── Nomenclator snapshot ───

type PopularPrice = { from_ro: string; to_ro: string; from_ru: string; to_ru: string; price: number };

async function computePopularPrices(
  supabase: ReturnType<typeof getSupabase>,
  rate: number,
): Promise<PopularPrice[]> {
  const prices: PopularPrice[] = [];

  for (const route of POPULAR_ROUTES) {
    const { data } = await supabase
      .from('v_interurban_v2_km_pairs')
      .select('km')
      .eq('from_stop', route.from)
      .eq('to_stop', route.to)
      .order('km', { ascending: true })
      .limit(1);

    const km = data?.[0] ? Number((data[0] as any).km) : 0;
    const price = (km > 0 && km < 1000) ? Math.round(km * rate) : Math.round(route.from === 'chisinau' ? 133 * rate : 0);
    prices.push({
      from_ro: route.from_ro,
      to_ro: route.to_ro,
      from_ru: route.from_ru,
      to_ru: route.to_ru,
      price,
    });
  }

  return prices;
}

async function saveNomenclator(
  supabase: ReturnType<typeof getSupabase>,
  rate: number,
) {
  const prices = await computePopularPrices(supabase, rate);
  await supabase.from('price_nomenclator').insert({ rate_per_km: rate, prices });
  return prices;
}

// ─── Telegram notifications ───

async function notifyAdmins(message: string, replyMarkup?: unknown) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  const supabase = getSupabase();
  const { data: admins } = await supabase
    .from('users')
    .select('telegram_id')
    .eq('role', 'ADMIN')
    .eq('active', true)
    .not('telegram_id', 'is', null);

  for (const admin of admins || []) {
    if (!admin.telegram_id) continue;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: admin.telegram_id,
          text: message,
          parse_mode: 'HTML',
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      });
    } catch (err) {
      console.error(`Failed to notify admin ${admin.telegram_id}:`, err);
    }
  }
}

function formatRateLine(label: string, newRate: number, oldRate: number | null): string {
  const oldStr = oldRate !== null ? oldRate.toFixed(2) : '—';
  return `${label}: <b>${newRate.toFixed(2)} lei/km</b> (anterior: ${oldStr})`;
}

// ─── Telegram message builder ───

function buildProposalMessage(
  effective: EffectiveRates,
  previous: CurrentRates,
  preview: PopularPrice[],
  source: 'cron' | 'manual',
): string {
  const baltiPrice = Math.round(133 * effective.interurbanLong);
  const priceLines = preview
    .map((p) => `  ${p.from_ro} → ${p.to_ro}: <b>${p.price} lei</b>`)
    .join('\n');

  const rateLines = [
    formatRateLine('Interurban lung', effective.interurbanLong, previous.interurbanLong),
    formatRateLine('Interurban scurt', effective.interurbanShort, previous.interurbanShort),
    formatRateLine('Suburban', effective.suburban, previous.suburban),
  ].join('\n');

  const sourceLabel = source === 'manual' ? ' (manual)' : '';

  return (
    `🆕 <b>Propunere tarife noi ANTA${sourceLabel}</b>\n\n` +
    `${rateLines}\n` +
    `Bălți → Chișinău: <b>${baltiPrice - 20} lei</b> (reducere -20)\n\n` +
    `<b>Destinații populare:</b>\n${priceLines}\n\n` +
    `⚠️ Prețurile NU sunt încă aplicate. Confirmă-le în panou → secțiunea <b>Tarife</b> pentru a le activa peste tot.`
  );
}

// ─── Apply (după confirmare) ───

/** Aplică efectiv tarifele peste tot: RPC + log + tariff_periods + nomenclator. */
async function applyEffectiveRates(
  supabase: ReturnType<typeof getSupabase>,
  effective: EffectiveRates,
  previous: CurrentRates,
): Promise<PriceUpdateResult> {
  // 1. Update prices + offers via DB function (v2)
  const { data: rowsUpdated, error: rpcError } = await supabase.rpc('update_prices_by_rate_v2', {
    new_rate_interurban_long: effective.interurbanLong,
    new_rate_interurban_short: effective.interurbanShort,
    new_rate_suburban: effective.suburban,
  });

  if (rpcError) throw new Error(`DB update failed: ${rpcError.message}`);

  // 2. Log price update
  await supabase.from('price_update_log').insert({
    old_rate: previous.interurbanLong,
    new_rate: effective.interurbanLong,
    rows_updated: rowsUpdated ?? 0,
    source_url: ANTA_URL,
    rate_interurban_short: effective.interurbanShort,
    rate_suburban: effective.suburban,
  });

  // 3. Insert tariff period
  const { periodStart, periodEnd } = computeTariffPeriod(effective.effectiveDate);
  await supabase.from('tariff_periods').insert({
    period_start: periodStart,
    period_end: periodEnd,
    rate_interurban_long: effective.interurbanLong,
    rate_interurban_short: effective.interurbanShort,
    rate_suburban: effective.suburban,
    source_url: ANTA_URL,
  });

  // 4. Save nomenclator snapshot
  await saveNomenclator(supabase, effective.interurbanLong);

  const baltiPrice = Math.round(133 * effective.interurbanLong);

  return {
    status: 'updated',
    rates: {
      interurbanLong: effective.interurbanLong,
      interurbanShort: effective.interurbanShort,
      suburban: effective.suburban,
    },
    previousRates: {
      interurbanLong: previous.interurbanLong,
      interurbanShort: previous.interurbanShort,
      suburban: previous.suburban,
    },
    rowsUpdated: rowsUpdated ?? 0,
    baltiChisinauOffer: baltiPrice - 20,
    period: { start: periodStart, end: periodEnd },
  };
}

// ─── Main: fetch ANTA → creează PROPUNERE (nu aplică) ───

export async function executeAntaPriceUpdate(options?: {
  sendTelegramNotification?: boolean;
  source?: 'cron' | 'manual';
}): Promise<PriceUpdateResult> {
  const { sendTelegramNotification = true, source = 'cron' } = options || {};

  try {
    // 1. Fetch & parse ANTA
    const res = await fetch(ANTA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`ANTA fetch failed: ${res.status}`);
    const html = await res.text();
    const rates = parseRates(html);

    const supabase = getSupabase();

    // 2. Load current rates, then resolve "effective" rates.
    // Suburban = rată FIXĂ de proprietar (app_config `rate_per_km_suburban`), decuplată de ANTA:
    // ANTA publică interraionalul doar ca PLAFON; noi păstrăm rata owner (ex. 1.07, sub plafon).
    // ANTA controlează doar interurbanul. Fallback la valoarea scraped ANTA doar dacă owner-ul lipsește.
    const currentRates = await loadCurrentRates(supabase);
    const effective: EffectiveRates = {
      interurbanLong: rates.interurbanLong,
      interurbanShort: rates.interurbanShort,
      suburban: currentRates.suburban ?? rates.suburban ?? rates.interurbanLong,
      effectiveDate: rates.effectiveDate,
    };

    // 3. Validate (după rezolvarea raionalului)
    validateRates(effective);

    // 4. Compare with current rates
    if (!hasAnyRateChanged(currentRates, effective)) {
      return {
        status: 'no_change',
        rates: {
          interurbanLong: effective.interurbanLong,
          interurbanShort: effective.interurbanShort,
          suburban: effective.suburban,
        },
      };
    }

    // 5. Creează PROPUNERE: superseda propunerile pending vechi, inserează una nouă.
    //    NU aplicăm nimic încă — se aplică doar după Confirmă în Telegram.
    await supabase
      .from('pending_price_updates')
      .update({ status: 'superseded' })
      .eq('status', 'pending');

    const preview = await computePopularPrices(supabase, effective.interurbanLong);

    const { data: inserted, error: insErr } = await supabase
      .from('pending_price_updates')
      .insert({
        rate_interurban_long: effective.interurbanLong,
        rate_interurban_short: effective.interurbanShort,
        rate_suburban: effective.suburban,
        effective_date: effective.effectiveDate,
        prev_interurban_long: currentRates.interurbanLong,
        prev_interurban_short: currentRates.interurbanShort,
        prev_suburban: currentRates.suburban,
        preview,
        source,
        source_url: ANTA_URL,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insErr) throw new Error(`Failed to create proposal: ${insErr.message}`);
    const proposalId = (inserted as { id: string }).id;

    // 6. Notifică adminii — DOAR informativ (fără butoane). Confirmarea se face în panou (Tarife).
    if (sendTelegramNotification) {
      await notifyAdmins(buildProposalMessage(effective, currentRates, preview, source));
    }

    return {
      status: 'proposed',
      proposalId,
      rates: {
        interurbanLong: effective.interurbanLong,
        interurbanShort: effective.interurbanShort,
        suburban: effective.suburban,
      },
      previousRates: {
        interurbanLong: currentRates.interurbanLong,
        interurbanShort: currentRates.interurbanShort,
        suburban: currentRates.suburban,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('ANTA price update error:', err);

    if (sendTelegramNotification) {
      await notifyAdmins(`⚠️ <b>Eroare la verificarea tarifelor ANTA</b>\n\n${message}`);
    }

    return { status: 'error', error: message };
  }
}

// ─── Decizie propunere (apelat din admin-API, declanșat de butonul din Telegram) ───

/** Aplică o propunere pending (atomic claim → applyEffectiveRates). Aplică EXACT valorile salvate, fără re-fetch ANTA. */
export async function applyProposal(
  proposalId: string,
  decidedBy: number | null,
): Promise<{ status: 'updated' | 'already_decided' | 'expired' | 'error'; current?: string; result?: PriceUpdateResult; error?: string }> {
  try {
    const supabase = getSupabase();

    // Atomic claim: doar dacă e încă 'pending' ȘI nu a expirat (24h). Previne dublă-aplicare și aplicarea unui preț învechit.
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - PROPOSAL_TTL_MS).toISOString();
    const { data: claimed, error: claimErr } = await supabase
      .from('pending_price_updates')
      .update({ status: 'approved', decided_at: nowIso, decided_by: decidedBy })
      .eq('id', proposalId)
      .eq('status', 'pending')
      .gte('created_at', cutoffIso)
      .select('*')
      .maybeSingle();

    if (claimErr) throw new Error(claimErr.message);

    if (!claimed) {
      const { data: row } = await supabase
        .from('pending_price_updates')
        .select('status, created_at')
        .eq('id', proposalId)
        .maybeSingle();
      const r = row as { status: string; created_at: string } | null;
      // Încă 'pending' dar mai veche de 24h → marchează 'expired' (terminal), nu aplica preț învechit.
      if (r && r.status === 'pending') {
        await supabase
          .from('pending_price_updates')
          .update({ status: 'expired', decided_at: nowIso, decided_by: decidedBy })
          .eq('id', proposalId)
          .eq('status', 'pending');
        return { status: 'expired' };
      }
      return { status: 'already_decided', current: r?.status ?? 'unknown' };
    }

    const c = claimed as Record<string, any>;
    const effective: EffectiveRates = {
      interurbanLong: Number(c.rate_interurban_long),
      interurbanShort: Number(c.rate_interurban_short),
      suburban: Number(c.rate_suburban),
      effectiveDate: c.effective_date ?? null,
    };
    const previous: CurrentRates = {
      interurbanLong: c.prev_interurban_long !== null ? Number(c.prev_interurban_long) : null,
      interurbanShort: c.prev_interurban_short !== null ? Number(c.prev_interurban_short) : null,
      suburban: c.prev_suburban !== null ? Number(c.prev_suburban) : null,
    };

    try {
      const result = await applyEffectiveRates(supabase, effective, previous);
      return { status: 'updated', result };
    } catch (applyErr) {
      // Aplicarea a eșuat după claim → readu propunerea la 'pending' ca să poată fi reîncercată.
      await supabase
        .from('pending_price_updates')
        .update({ status: 'pending', decided_at: null, decided_by: null })
        .eq('id', proposalId);
      throw applyErr;
    }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/** Respinge o propunere pending (nu aplică nimic). */
export async function rejectProposal(
  proposalId: string,
  decidedBy: number | null,
): Promise<{ status: 'rejected' | 'already_decided' | 'error'; current?: string; error?: string }> {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('pending_price_updates')
      .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: decidedBy })
      .eq('id', proposalId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!data) {
      const { data: row } = await supabase
        .from('pending_price_updates')
        .select('status')
        .eq('id', proposalId)
        .maybeSingle();
      return { status: 'already_decided', current: (row as { status: string } | null)?.status ?? 'unknown' };
    }

    return { status: 'rejected' };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
