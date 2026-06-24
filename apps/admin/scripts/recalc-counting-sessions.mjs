#!/usr/bin/env node
/**
 * recalc-counting-sessions.mjs
 *
 * Однократный backfill. Проходит по всем completed-сессиям Numărare (interurban)
 * и пересчитывает tur_total_lei / retur_total_lei / tur_single_lei / retur_single_lei
 * + km_from_start в counting_entries по текущей логике getRouteStops + getTariffConfig.
 *
 * Зачем: после миграций 5634d1c (interurban_v2_*), 6e3aac7 (retur_tariff_id) и 0139180,
 * сохранённые суммы за май/раньше расходятся с тем, что показывает audit-вид,
 * который пересчитывает на лету. Этот скрипт приводит БД к новой логике.
 *
 * Запуск:
 *   cd apps/admin
 *   node scripts/recalc-counting-sessions.mjs --dry-run   # просто показать diff
 *   node scripts/recalc-counting-sessions.mjs             # реально записать
 *   node scripts/recalc-counting-sessions.mjs --session=<uuid>   # только одну сессию
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ─── Загрузка .env ────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../.env');
try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* env optional */ }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: нужны SUPABASE_URL и SUPABASE_SERVICE_KEY в окружении или в apps/admin/.env');
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_SESSION = (args.find(a => a.startsWith('--session=')) || '').split('=')[1] || null;
const FORCE = args.includes('--force'); // отключить safety threshold

// Safety: пропускать сессию, если recompute даёт сдвиг > этого порога — значит, у route поломана
// структура остановок (например, мульти-branch routes 21/29 — getRouteStops возвращает не все стопы)
const SAFETY_DROP_PCT = 0.18;      // >18% падения суммы — подозрительно
const SAFETY_DROP_ABS = 250;       // или сдвиг > 250 lei
const SAFETY_STOPS_RATIO = 0.7;    // или new stops < 70% от saved entries

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ─── Чистая функция calculateDirection (копия из calculation.ts) ──────────────
function calculateDirection(entries, ratePerKmLong, ratePerKmShort) {
  if (entries.length < 2) {
    return { longSum: 0, shortSum: 0, total: 0, details: [] };
  }
  const sorted = [...entries].sort((a, b) => a.stopOrder - b.stopOrder);

  const shortRides = [];
  for (const entry of sorted) {
    for (const sp of entry.shortPassengers) {
      shortRides.push({
        boardedOrder: sp.boardedStopOrder,
        exitOrder: entry.stopOrder,
        count: sp.passengerCount,
        km: sp.kmDistance,
      });
    }
  }

  let shortSum = 0;
  for (const ride of shortRides) {
    shortSum += ride.km * ride.count * ratePerKmShort;
  }

  const details = [];
  let longSum = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i], next = sorted[i + 1];
    const kmTronson = next.kmFromStart - cur.kmFromStart;
    let shortInTransit = 0;
    for (const r of shortRides) {
      if (r.boardedOrder <= cur.stopOrder && r.exitOrder > cur.stopOrder) shortInTransit += r.count;
    }
    const longPassengers = Math.max(0, cur.totalPassengers - shortInTransit);
    const tronsonSum = kmTronson * longPassengers * ratePerKmLong;
    details.push({ kmTronson, longPassengers, shortInTransit, tronsonSum });
    longSum += tronsonSum;
  }

  return {
    longSum: Math.round(longSum * 100) / 100,
    shortSum: Math.round(shortSum * 100) / 100,
    total: Math.round((longSum + shortSum) * 100) / 100,
    details,
  };
}

function calculateSingleTariff(entries, rate) {
  return calculateDirection(entries, rate, rate).total;
}

// ─── getRouteStops (новая логика из actions.ts) ──────────────────────────────
const COUNTING_ROUTE_MAP = { 13: 16 };
const stopsCache = new Map(); // key=`${crmRouteId}|${direction}` → stops[]

async function getRouteStops(crmRouteId, direction) {
  const cacheKey = `${crmRouteId}|${direction}`;
  if (stopsCache.has(cacheKey)) return stopsCache.get(cacheKey);

  const stopsRouteId = COUNTING_ROUTE_MAP[crmRouteId] ?? crmRouteId;

  const { data: route, error: rErr } = await sb
    .from('interurban_v2_routes')
    .select('tariff_id, retur_tariff_id, start_stop_order, start_branch')
    .eq('crm_route_id', stopsRouteId)
    .limit(1)
    .single();
  if (rErr || !route) {
    stopsCache.set(cacheKey, []);
    return [];
  }

  const effectiveTariffId = direction === 'retur'
    ? (route.retur_tariff_id ?? route.tariff_id)
    : route.tariff_id;

  const { data: rows } = await sb
    .from('interurban_v2_stops')
    .select('stop_order, name_ro, km_from_start')
    .eq('tariff_id', effectiveTariffId)
    .eq('branch', route.start_branch || 'main')
    .gte('stop_order', route.start_stop_order || 1)
    .order('stop_order', { ascending: true });

  if (!rows || rows.length === 0) {
    stopsCache.set(cacheKey, []);
    return [];
  }

  const firstKm = Number(rows[0].km_from_start);
  const lastKm = Number(rows[rows.length - 1].km_from_start);
  const ordered = direction === 'tur' ? rows : [...rows].reverse();

  const stops = ordered.map((row, idx) => {
    const stopKm = Number(row.km_from_start);
    const kmRelative = direction === 'tur' ? stopKm - firstKm : lastKm - stopKm;
    return {
      stopOrder: idx + 1,
      nameRo: row.name_ro,
      kmFromStart: Math.round(kmRelative * 10) / 10,
    };
  });

  stopsCache.set(cacheKey, stops);
  return stops;
}

// ─── getTariffConfig (новая логика, кэш по дате) ─────────────────────────────
const tariffCache = new Map();
let appConfigCache = null;

async function loadAppConfig() {
  if (appConfigCache) return appConfigCache;
  const { data } = await sb.from('app_config').select('key, value');
  const m = {};
  for (const row of data || []) m[row.key] = row.value;
  appConfigCache = m;
  return m;
}

async function getTariffConfig(date) {
  if (tariffCache.has(date)) return tariffCache.get(date);
  const settings = await loadAppConfig();
  const doubleTariff = settings['dual_interurban_tariff'] === 'true';
  const shortDistanceKm = parseInt(settings['short_distance_threshold_km'] || '65');

  const { data: period } = await sb
    .from('tariff_periods')
    .select('rate_interurban_long, rate_interurban_short, rate_suburban')
    .lte('period_start', date)
    .gte('period_end', date)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  let cfg;
  if (period) {
    cfg = {
      ratePerKmLong: Number(period.rate_interurban_long),
      ratePerKmShort: Number(period.rate_interurban_short),
      ratePerKmSuburban: Number(period.rate_suburban ?? 0),
      doubleTariff,
      shortDistanceKm,
    };
  } else {
    cfg = {
      ratePerKmLong: parseFloat(settings['rate_per_km_long'] || '0.94'),
      ratePerKmShort: parseFloat(settings['rate_per_km_interurban_short'] || '0.94'),
      ratePerKmSuburban: parseFloat(settings['rate_per_km_suburban'] || '1.20'),
      doubleTariff,
      shortDistanceKm,
    };
  }
  tariffCache.set(date, cfg);
  return cfg;
}

// ─── Загрузка сохранённых entries + shorts ───────────────────────────────────
async function loadEntriesForSession(sessionId, table = 'counting_entries', shortsTable = 'counting_short_passengers') {
  const { data } = await sb
    .from(table)
    .select(`id, direction, stop_order, stop_name_ro, km_from_start, total_passengers, alighted,
             ${shortsTable}(id, boarded_stop_order, boarded_stop_name_ro, km_distance, passenger_count, amount_lei)`)
    .eq('session_id', sessionId);
  return (data || []).map(e => ({
    id: e.id,
    direction: e.direction,
    stopOrder: e.stop_order,
    stopNameRo: e.stop_name_ro,
    kmFromStart: Number(e.km_from_start),
    totalPassengers: e.total_passengers || 0,
    alighted: e.alighted ?? 0,
    shortPassengers: (e[shortsTable] || []).map(sp => ({
      id: sp.id,
      boardedStopOrder: sp.boarded_stop_order,
      boardedStopNameRo: sp.boarded_stop_name_ro,
      kmDistance: Number(sp.km_distance),
      passengerCount: sp.passenger_count,
      amountLei: Number(sp.amount_lei || 0),
    })),
  }));
}

// ─── Построить StopEntry[] так же, как CountingForm.buildStopEntries ────────
function buildStopEntries(stops, savedEntries) {
  const byOrder = new Map(savedEntries.map(e => [e.stopOrder, e]));
  return stops.map(stop => {
    const e = byOrder.get(stop.stopOrder);
    return {
      stopOrder: stop.stopOrder,
      stopNameRo: stop.nameRo,
      kmFromStart: stop.kmFromStart,
      totalPassengers: e?.totalPassengers || 0,
      alighted: e?.alighted || 0,
      shortPassengers: e?.shortPassengers || [],
    };
  });
}

// ─── Пересчёт одной сессии ──────────────────────────────────────────────────
async function processSession(session) {
  const { id: sessionId, crm_route_id: crmRouteId, assignment_date: date,
          tur_total_lei: oldTur, retur_total_lei: oldRetur,
          tur_single_lei: oldTurSingle, retur_single_lei: oldReturSingle,
          audit_status: auditStatus, route_type: routeType } = session;

  if (routeType === 'suburban') return { skipped: 'suburban' };

  const [turStops, returStops] = await Promise.all([
    getRouteStops(crmRouteId, 'tur'),
    getRouteStops(crmRouteId, 'retur'),
  ]);
  if (turStops.length === 0 || returStops.length === 0) {
    return { skipped: `нет стопов для route ${crmRouteId}` };
  }

  const tariff = await getTariffConfig(date);

  // OPERATOR
  const opEntries = await loadEntriesForSession(sessionId, 'counting_entries', 'counting_short_passengers');
  const opTurSaved = opEntries.filter(e => e.direction === 'tur');
  const opReturSaved = opEntries.filter(e => e.direction === 'retur');
  const opTurEntries = buildStopEntries(turStops, opTurSaved);
  const opReturEntries = buildStopEntries(returStops, opReturSaved);
  const newTur = Math.round(calculateDirection(opTurEntries, tariff.ratePerKmLong, tariff.ratePerKmShort).total);
  const newRetur = Math.round(calculateDirection(opReturEntries, tariff.ratePerKmLong, tariff.ratePerKmShort).total);
  const newTurSingle = Math.round(calculateSingleTariff(opTurEntries, tariff.ratePerKmLong));
  const newReturSingle = Math.round(calculateSingleTariff(opReturEntries, tariff.ratePerKmLong));

  // AUDIT (если audit_status='completed')
  let auditUpdate = null;
  if (auditStatus === 'completed') {
    const auEntries = await loadEntriesForSession(sessionId, 'counting_audit_entries', 'counting_audit_short_passengers');
    const auTurSaved = auEntries.filter(e => e.direction === 'tur');
    const auReturSaved = auEntries.filter(e => e.direction === 'retur');
    const auTurEntries = buildStopEntries(turStops, auTurSaved);
    const auReturEntries = buildStopEntries(returStops, auReturSaved);
    auditUpdate = {
      audit_tur_total_lei: Math.round(calculateDirection(auTurEntries, tariff.ratePerKmLong, tariff.ratePerKmShort).total),
      audit_retur_total_lei: Math.round(calculateDirection(auReturEntries, tariff.ratePerKmLong, tariff.ratePerKmShort).total),
      audit_tur_single_lei: Math.round(calculateSingleTariff(auTurEntries, tariff.ratePerKmLong)),
      audit_retur_single_lei: Math.round(calculateSingleTariff(auReturEntries, tariff.ratePerKmLong)),
      auditTurDelta: 0, auditReturDelta: 0,
    };
    auditUpdate.auditTurDelta = (auditUpdate.audit_tur_total_lei || 0) - (session.audit_tur_total_lei || 0);
    auditUpdate.auditReturDelta = (auditUpdate.audit_retur_total_lei || 0) - (session.audit_retur_total_lei || 0);
  }

  const diff = (newTur + newRetur) - ((oldTur || 0) + (oldRetur || 0));
  const changed = newTur !== oldTur || newRetur !== oldRetur ||
                  newTurSingle !== oldTurSingle || newReturSingle !== oldReturSingle ||
                  (auditUpdate && (auditUpdate.auditTurDelta !== 0 || auditUpdate.auditReturDelta !== 0));

  if (!changed) {
    return { unchanged: true };
  }

  // Safety check: пропускаем сессии с подозрительно большим сдвигом или урезанным списком стопов
  if (!FORCE) {
    const oldTotal = (oldTur || 0) + (oldRetur || 0);
    const dropPct = oldTotal > 0 ? Math.abs(diff) / oldTotal : 0;
    const turStopsCount = turStops.length;
    const returStopsCount = returStops.length;
    const savedTurCount = opTurSaved.length;
    const savedReturCount = opReturSaved.length;
    const stopsTooFew = (savedTurCount > 0 && turStopsCount / savedTurCount < SAFETY_STOPS_RATIO) ||
                       (savedReturCount > 0 && returStopsCount / savedReturCount < SAFETY_STOPS_RATIO);
    if (stopsTooFew || dropPct > SAFETY_DROP_PCT || Math.abs(diff) > SAFETY_DROP_ABS) {
      return {
        skipped: `safety: drop ${(dropPct*100).toFixed(0)}% (${diff} lei), stops ${turStopsCount}/${savedTurCount} tur, ${returStopsCount}/${savedReturCount} retur`,
        diff, oldTur, oldRetur, newTur, newRetur,
      };
    }
  }

  if (DRY_RUN) {
    return {
      diff, oldTur, oldRetur, newTur, newRetur,
      oldTurSingle, oldReturSingle, newTurSingle, newReturSingle,
      auditUpdate,
    };
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────
  // 1. counting_sessions (totals)
  const sessUpdate = {
    tur_total_lei: newTur,
    retur_total_lei: newRetur,
    tur_single_lei: newTurSingle,
    retur_single_lei: newReturSingle,
  };
  if (auditUpdate) {
    sessUpdate.audit_tur_total_lei = auditUpdate.audit_tur_total_lei;
    sessUpdate.audit_retur_total_lei = auditUpdate.audit_retur_total_lei;
    sessUpdate.audit_tur_single_lei = auditUpdate.audit_tur_single_lei;
    sessUpdate.audit_retur_single_lei = auditUpdate.audit_retur_single_lei;
  }
  const { error: sErr } = await sb.from('counting_sessions').update(sessUpdate).eq('id', sessionId);
  if (sErr) throw new Error(`UPDATE counting_sessions: ${sErr.message}`);

  // 2. counting_entries.km_from_start — синхронизация с новыми km по stop_order
  // (только для тех записей, что присутствуют; не добавляем/удаляем)
  for (const dir of ['tur', 'retur']) {
    const newStops = dir === 'tur' ? turStops : returStops;
    const byOrder = new Map(newStops.map(s => [s.stopOrder, s.kmFromStart]));
    const savedDir = opEntries.filter(e => e.direction === dir);
    for (const e of savedDir) {
      const newKm = byOrder.get(e.stopOrder);
      if (newKm == null || Math.abs(newKm - e.kmFromStart) < 0.05) continue;
      const { error } = await sb.from('counting_entries')
        .update({ km_from_start: newKm }).eq('id', e.id);
      if (error) throw new Error(`UPDATE counting_entries id=${e.id}: ${error.message}`);
    }
  }

  // 3. Те же UPDATE для counting_audit_entries
  if (auditUpdate) {
    const auEntries = await loadEntriesForSession(sessionId, 'counting_audit_entries', 'counting_audit_short_passengers');
    for (const dir of ['tur', 'retur']) {
      const newStops = dir === 'tur' ? turStops : returStops;
      const byOrder = new Map(newStops.map(s => [s.stopOrder, s.kmFromStart]));
      const savedDir = auEntries.filter(e => e.direction === dir);
      for (const e of savedDir) {
        const newKm = byOrder.get(e.stopOrder);
        if (newKm == null || Math.abs(newKm - e.kmFromStart) < 0.05) continue;
        const { error } = await sb.from('counting_audit_entries')
          .update({ km_from_start: newKm }).eq('id', e.id);
        if (error) throw new Error(`UPDATE counting_audit_entries id=${e.id}: ${error.message}`);
      }
    }
  }

  return { diff, oldTur, oldRetur, newTur, newRetur, auditUpdate };
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (без записи в БД)' : 'WRITE'}`);

  // Pagination — Supabase limit 1000 по умолчанию
  let sessions = [];
  if (ONLY_SESSION) {
    const { data, error } = await sb.from('counting_sessions')
      .select(`id, crm_route_id, assignment_date, status, audit_status,
               tur_total_lei, retur_total_lei, tur_single_lei, retur_single_lei,
               audit_tur_total_lei, audit_retur_total_lei, audit_tur_single_lei, audit_retur_single_lei,
               crm_routes!inner(route_type)`)
      .eq('id', ONLY_SESSION);
    if (error) { console.error(error.message); process.exit(1); }
    sessions = data || [];
  } else {
    const PAGE = 500;
    let from = 0;
    while (true) {
      const { data, error } = await sb.from('counting_sessions')
        .select(`id, crm_route_id, assignment_date, status, audit_status,
                 tur_total_lei, retur_total_lei, tur_single_lei, retur_single_lei,
                 audit_tur_total_lei, audit_retur_total_lei, audit_tur_single_lei, audit_retur_single_lei,
                 crm_routes!inner(route_type)`)
        .eq('status', 'completed')
        .order('assignment_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) { console.error(error.message); process.exit(1); }
      if (!data || data.length === 0) break;
      sessions.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`Найдено completed-сессий: ${sessions.length}`);

  let updated = 0, unchanged = 0, skipped = 0, safetySkipped = 0, totalDiff = 0;
  const samples = [];
  const safetyLog = [];

  for (const s of sessions) {
    const routeType = s.crm_routes?.route_type || 'interurban';
    try {
      const res = await processSession({ ...s, route_type: routeType });
      if (res.skipped) {
        if (res.skipped.startsWith('safety:')) {
          safetySkipped++;
          if (safetyLog.length < 25) safetyLog.push({ date: s.assignment_date, route: s.crm_route_id, diff: res.diff, reason: res.skipped });
        } else {
          skipped++;
        }
        continue;
      }
      if (res.unchanged) {
        unchanged++;
        continue;
      }
      updated++;
      totalDiff += res.diff || 0;
      if (samples.length < 12 || Math.abs(res.diff) >= 50) {
        samples.push({
          date: s.assignment_date,
          route: s.crm_route_id,
          oldT: res.oldTur, newT: res.newTur,
          oldR: res.oldRetur, newR: res.newRetur,
          diff: res.diff,
          audit: res.auditUpdate ? `Δaudit ${res.auditUpdate.auditTurDelta + res.auditUpdate.auditReturDelta}` : '',
        });
      }
    } catch (e) {
      console.error(`Сессия ${s.id} (${s.assignment_date}, route ${s.crm_route_id}):`, e.message);
      skipped++;
    }
  }

  console.log('\n─── ОБРАЗЦЫ (до 12 + крупные сдвиги) ──────────────────────────────');
  console.log('date          route   tur (old → new)    retur (old → new)    Δ    audit');
  for (const x of samples) {
    console.log(
      `${x.date}  ${String(x.route).padEnd(4)}   ${String(x.oldT).padStart(5)} → ${String(x.newT).padStart(5)}    ${String(x.oldR).padStart(5)} → ${String(x.newR).padStart(5)}   ${String(x.diff > 0 ? '+'+x.diff : x.diff).padStart(5)}  ${x.audit}`
    );
  }

  if (safetyLog.length > 0) {
    console.log('\n─── SAFETY-SKIP (route/struct broken, не трогаем) ─────────────────');
    for (const x of safetyLog) {
      console.log(`${x.date}  route ${String(x.route).padEnd(4)} Δ ${String(x.diff).padStart(6)} — ${x.reason}`);
    }
  }

  console.log('\n─── ИТОГ ──────────────────────────────────────────────────────────');
  console.log(`Всего просмотрено: ${sessions.length}`);
  console.log(`Изменено:          ${updated}`);
  console.log(`Без изменений:     ${unchanged}`);
  console.log(`Пропущено (норм):  ${skipped}`);
  console.log(`Safety-skip:       ${safetySkipped}`);
  console.log(`Суммарный сдвиг:   ${totalDiff > 0 ? '+' : ''}${totalDiff} lei`);
  console.log(DRY_RUN ? '\n(DRY-RUN — ничего не записано. Без флага --dry-run скрипт пишет в БД.)' : '\nГотово.');
}

main().catch(e => { console.error(e); process.exit(1); });
