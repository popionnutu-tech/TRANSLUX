import { getSupabase } from '@/lib/supabase';

// ─── Constants ───

const ANTA_URL =
  'https://anta.gov.md/content/tarifele-provizorii-pentru-serviciile-regulate-de-transport';
const RATE_MIN = 0.5;
const RATE_MAX = 2.0;
const RATE_TOLERANCE = 0.001;

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
  suburban: number;
  effectiveDate: string | null; // YYYY-MM-DD parsed from "începând cu DD.MM.YYYY"
}

interface CurrentRates {
  interurbanLong: number | null;
  interurbanShort: number | null;
  suburban: number | null;
}

export interface PriceUpdateResult {
  status: 'updated' | 'no_change' | 'error';
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

  // Parse effective date from "începând cu DD.MM.YYYY"
  const datePattern = /[iî]ncep[aâ]nd\s+cu\s+(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/i;
  const dateMatch = text.match(datePattern);
  let effectiveDate: string | null = null;
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    effectiveDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return { interurbanLong, interurbanShort, suburban, effectiveDate };
}

function validateRates(rates: ParsedRates): void {
  const entries: Array<[string, number]> = [
    ['interurbanLong', rates.interurbanLong],
    ['interurbanShort', rates.interurbanShort],
    ['suburban', rates.suburban],
  ];

  for (const [name, value] of entries) {
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
  const pairs: Array<[number | null, number]> = [
    [current.interurbanLong, parsed.interurbanLong],
    [current.interurbanShort, parsed.interurbanShort],
    [current.suburban, parsed.suburban],
  ];

  return pairs.some(
    ([cur, next]) => cur === null || Math.abs(cur - next) >= RATE_TOLERANCE,
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

async function saveNomenclator(
  supabase: ReturnType<typeof getSupabase>,
  rate: number,
) {
  const prices: Array<{
    from_ro: string;
    to_ro: string;
    from_ru: string;
    to_ru: string;
    price: number;
  }> = [];

  for (const route of POPULAR_ROUTES) {
    const { data } = await supabase
      .from('route_km_pairs')
      .select('price')
      .eq('from_stop', route.from)
      .eq('to_stop', route.to)
      .limit(1);

    const price = data?.[0]?.price ?? Math.round(route.from === 'chisinau' ? 133 * rate : 0);
    prices.push({
      from_ro: route.from_ro,
      to_ro: route.to_ro,
      from_ru: route.from_ru,
      to_ru: route.to_ru,
      price,
    });
  }

  await supabase.from('price_nomenclator').insert({ rate_per_km: rate, prices });

  return prices;
}

// ─── Telegram notifications ───

async function notifyAdmins(message: string) {
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

// ─── Main function ───

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

    // 2. Validate all 3 rates
    validateRates(rates);

    const supabase = getSupabase();

    // 3. Compare with current rates
    const currentRates = await loadCurrentRates(supabase);

    if (!hasAnyRateChanged(currentRates, rates)) {
      return {
        status: 'no_change',
        rates: {
          interurbanLong: rates.interurbanLong,
          interurbanShort: rates.interurbanShort,
          suburban: rates.suburban,
        },
      };
    }

    // 4. Update all prices + offers via DB function (v2)
    const { data: rowsUpdated, error: rpcError } = await supabase.rpc(
      'update_prices_by_rate_v2',
      {
        new_rate_interurban_long: rates.interurbanLong,
        new_rate_interurban_short: rates.interurbanShort,
        new_rate_suburban: rates.suburban,
      },
    );

    if (rpcError) throw new Error(`DB update failed: ${rpcError.message}`);

    // 5. Log price update
    await supabase.from('price_update_log').insert({
      old_rate: currentRates.interurbanLong,
      new_rate: rates.interurbanLong,
      rows_updated: rowsUpdated ?? 0,
      source_url: ANTA_URL,
      rate_interurban_short: rates.interurbanShort,
      rate_suburban: rates.suburban,
    });

    // 6. Insert tariff period
    const { periodStart, periodEnd } = computeTariffPeriod(rates.effectiveDate);
    await supabase.from('tariff_periods').insert({
      period_start: periodStart,
      period_end: periodEnd,
      rate_interurban_long: rates.interurbanLong,
      rate_interurban_short: rates.interurbanShort,
      rate_suburban: rates.suburban,
      source_url: ANTA_URL,
    });

    // 7. Save nomenclator snapshot
    const prices = await saveNomenclator(supabase, rates.interurbanLong);

    // 8. Notify admins via Telegram
    if (sendTelegramNotification) {
      const baltiPrice = Math.round(133 * rates.interurbanLong);
      const priceLines = prices
        .map((p) => `  ${p.from_ro} → ${p.to_ro}: <b>${p.price} lei</b>`)
        .join('\n');

      const rateLines = [
        formatRateLine('Interurban lung', rates.interurbanLong, currentRates.interurbanLong),
        formatRateLine('Interurban scurt', rates.interurbanShort, currentRates.interurbanShort),
        formatRateLine('Suburban', rates.suburban, currentRates.suburban),
      ].join('\n');

      const sourceLabel = source === 'manual' ? ' (manual)' : '';
      await notifyAdmins(
        `🔄 <b>Tarife actualizate ANTA${sourceLabel}</b>\n\n` +
          `${rateLines}\n` +
          `Bălți → Chișinău: <b>${baltiPrice - 20} lei</b> (reducere -20)\n\n` +
          `<b>Destinații populare:</b>\n${priceLines}\n\n` +
          `✅ ${rowsUpdated} prețuri actualizate automat`,
      );
    }

    const baltiPrice = Math.round(133 * rates.interurbanLong);

    return {
      status: 'updated',
      rates: {
        interurbanLong: rates.interurbanLong,
        interurbanShort: rates.interurbanShort,
        suburban: rates.suburban,
      },
      previousRates: {
        interurbanLong: currentRates.interurbanLong,
        interurbanShort: currentRates.interurbanShort,
        suburban: currentRates.suburban,
      },
      rowsUpdated: rowsUpdated ?? 0,
      baltiChisinauOffer: baltiPrice - 20,
      period: { start: periodStart, end: periodEnd },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('ANTA price update error:', err);

    if (sendTelegramNotification) {
      await notifyAdmins(`⚠️ <b>Eroare actualizare prețuri ANTA</b>\n\n${message}`);
    }

    return { status: 'error', error: message };
  }
}
