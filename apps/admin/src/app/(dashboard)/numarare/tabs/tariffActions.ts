'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { executeAntaPriceUpdate, applyProposal, rejectProposal, type PriceUpdateResult } from '@/lib/update-prices';

// ─── Типы ───

export interface TariffPeriod {
  id: number;
  period_start: string;
  period_end: string;
  rate_interurban_long: number;
  rate_interurban_short: number;
  rate_suburban: number;
  created_at: string;
}

export interface NomenclatorPrice {
  from_ro: string;
  to_ro: string;
  from_ru: string;
  to_ru: string;
  price: number;
}

export interface NomenclatorSnapshot {
  id: number;
  rate_per_km: number;
  prices: NomenclatorPrice[];
  created_at: string;
}

export interface TariffData {
  currentRates: {
    interurbanLong: number;
    interurbanShort: number;
    suburban: number;
  };
  dualTariffEnabled: boolean;
  shortDistanceKm: number;
  history: TariffPeriod[];
  nomenclator: NomenclatorSnapshot | null;
}

// ─── Вспомогательные функции ───

const TARIFF_CONFIG_KEYS = [
  'rate_per_km_long',
  'rate_per_km_interurban_short',
  'rate_per_km_suburban',
  'dual_interurban_tariff',
  'short_distance_threshold_km',
] as const;

const TARIFF_PATH = '/numarare';

function parseConfigMap(rows: { key: string; value: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

function hasAdminCamereAccess(role: string): boolean {
  return role === 'ADMIN_CAMERE' || role === 'ADMIN';
}

async function upsertConfigKey(key: string, value: string): Promise<{ error?: string }> {
  const sb = getSupabase();

  const { error } = await sb
    .from('app_config')
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (error) {
    return { error: error.message };
  }

  return {};
}

// ─── Чтение данных тарифов (публичное, без авторизации) ───

export async function getTariffData(): Promise<TariffData> {
  const sb = getSupabase();

  const [configResult, historyResult, nomenclatorResult] = await Promise.all([
    sb.from('app_config')
      .select('key, value')
      .in('key', [...TARIFF_CONFIG_KEYS]),
    sb.from('tariff_periods')
      .select('*')
      .order('period_start', { ascending: false })
      .limit(20),
    sb.from('price_nomenclator')
      .select('id, rate_per_km, prices, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  const config = parseConfigMap(configResult.data || []);

  const history: TariffPeriod[] = (historyResult.data || []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    period_start: row.period_start as string,
    period_end: row.period_end as string,
    rate_interurban_long: Number(row.rate_interurban_long),
    rate_interurban_short: Number(row.rate_interurban_short),
    rate_suburban: Number(row.rate_suburban),
    created_at: row.created_at as string,
  }));

  const nomenclator: NomenclatorSnapshot | null = nomenclatorResult.data
    ? {
        id: nomenclatorResult.data.id as number,
        rate_per_km: Number(nomenclatorResult.data.rate_per_km),
        prices: nomenclatorResult.data.prices as NomenclatorPrice[],
        created_at: nomenclatorResult.data.created_at as string,
      }
    : null;

  return {
    currentRates: {
      interurbanLong: parseFloat(config['rate_per_km_long'] || '0.94'),
      interurbanShort: parseFloat(config['rate_per_km_interurban_short'] || '1.06'),
      suburban: parseFloat(config['rate_per_km_suburban'] || '1.20'),
    },
    dualTariffEnabled: config['dual_interurban_tariff'] === 'true',
    shortDistanceKm: parseInt(config['short_distance_threshold_km'] || '65'),
    history,
    nomenclator,
  };
}

// ─── Переключение двойного тарифа ───

export async function toggleDualTariff(
  enabled: boolean,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session || !hasAdminCamereAccess(session.role)) {
    return { error: 'Acces interzis' };
  }

  const result = await upsertConfigKey('dual_interurban_tariff', String(enabled));
  if (result.error) return result;

  revalidatePath(TARIFF_PATH);
  return {};
}

// ─── Обновление порога короткой дистанции ───

export async function updateShortDistanceThreshold(
  km: number,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session || !hasAdminCamereAccess(session.role)) {
    return { error: 'Acces interzis' };
  }

  if (km <= 0 || km > 500) {
    return { error: 'Pragul trebuie sa fie intre 1 si 500 km' };
  }

  const result = await upsertConfigKey('short_distance_threshold_km', String(km));
  if (result.error) return result;

  revalidatePath(TARIFF_PATH);
  return {};
}

// ─── Ручное обновление тарифов ANTA ───

export interface TriggerPriceUpdateResult {
  success: boolean;
  status: 'updated' | 'no_change' | 'proposed' | 'error';
  message: string;
  rates?: PriceUpdateResult['rates'];
  previousRates?: PriceUpdateResult['previousRates'];
  rowsUpdated?: number;
}

export async function triggerPriceUpdate(): Promise<TriggerPriceUpdateResult> {
  const session = await verifySession();
  if (!session || !hasAdminCamereAccess(session.role)) {
    return { success: false, status: 'error', message: 'Acces interzis' };
  }

  const result = await executeAntaPriceUpdate({
    source: 'manual',
    sendTelegramNotification: true,
  });

  if (result.status === 'error') {
    return { success: false, status: 'error', message: result.error || 'Eroare necunoscuta' };
  }

  if (result.status === 'no_change') {
    return {
      success: true,
      status: 'no_change',
      message: 'Tarifele ANTA sunt deja actuale. Nu s-au facut modificari.',
      rates: result.rates,
    };
  }

  // status === 'proposed' — propunere creată; se confirmă mai jos, în secțiunea Tarife.
  return {
    success: true,
    status: 'proposed',
    message: 'Propunere nouă creată. Confirm-o mai jos pentru a aplica prețurile peste tot.',
    rates: result.rates,
    previousRates: result.previousRates,
  };
}

// ─── Propuneri de tarif în așteptare (confirmare în panou) ───

export interface PendingProposal {
  id: string;
  rateInterurbanLong: number;
  rateInterurbanShort: number;
  rateSuburban: number;
  prevInterurbanLong: number | null;
  prevInterurbanShort: number | null;
  prevSuburban: number | null;
  effectiveDate: string | null;
  source: string;
  createdAt: string;
}

export interface DecideProposalResult {
  success: boolean;
  message: string;
}

/** Cea mai recentă propunere 'pending' (sau null). */
export async function getPendingProposal(): Promise<PendingProposal | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from('pending_price_updates')
    .select(
      'id, rate_interurban_long, rate_interurban_short, rate_suburban, prev_interurban_long, prev_interurban_short, prev_suburban, effective_date, source, created_at',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const r = data as Record<string, any>;
  return {
    id: r.id,
    rateInterurbanLong: Number(r.rate_interurban_long),
    rateInterurbanShort: Number(r.rate_interurban_short),
    rateSuburban: Number(r.rate_suburban),
    prevInterurbanLong: r.prev_interurban_long !== null ? Number(r.prev_interurban_long) : null,
    prevInterurbanShort: r.prev_interurban_short !== null ? Number(r.prev_interurban_short) : null,
    prevSuburban: r.prev_suburban !== null ? Number(r.prev_suburban) : null,
    effectiveDate: r.effective_date ?? null,
    source: r.source,
    createdAt: r.created_at,
  };
}

export async function confirmTariffProposal(id: string): Promise<DecideProposalResult> {
  const session = await verifySession();
  if (!session || !hasAdminCamereAccess(session.role)) {
    return { success: false, message: 'Acces interzis' };
  }

  const res = await applyProposal(id, null);

  if (res.status === 'updated') {
    revalidatePath('/');
    revalidatePath(TARIFF_PATH);
    return {
      success: true,
      message: `Tarife aplicate peste tot. ${res.result?.rowsUpdated ?? 0} preturi recalculate.`,
    };
  }
  if (res.status === 'expired') {
    return { success: false, message: 'Propunere expirata (mai veche de 24h). Reia verificarea tarifelor.' };
  }
  if (res.status === 'already_decided') {
    return { success: false, message: 'Propunere deja procesata.' };
  }
  return { success: false, message: res.error || 'Eroare la aplicare' };
}

export async function rejectTariffProposal(id: string): Promise<DecideProposalResult> {
  const session = await verifySession();
  if (!session || !hasAdminCamereAccess(session.role)) {
    return { success: false, message: 'Acces interzis' };
  }

  const res = await rejectProposal(id, null);

  if (res.status === 'rejected') {
    revalidatePath(TARIFF_PATH);
    return { success: true, message: 'Propunere respinsa. Preturile raman neschimbate.' };
  }
  if (res.status === 'already_decided') {
    return { success: false, message: 'Propunere deja procesata.' };
  }
  return { success: false, message: res.error || 'Eroare la respingere' };
}
