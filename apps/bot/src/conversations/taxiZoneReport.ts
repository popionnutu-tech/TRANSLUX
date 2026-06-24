import type { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from '../types.js';
import type { Trip } from '@translux/db';
import { POINT_LABELS } from '@translux/db';
import {
  getUserByTelegramId,
  getAllTripsForDirection,
  getDirectionForPoint,
  getTaxiZoneReportedTripIds,
  createTaxiZoneReport,
  effectiveRoleToday,
} from '../services/db.js';
import { getTodayDate, formatTime, formatDate, haversineDistance } from '../utils.js';
import { config } from '../config.js';
import { showMainMenu } from '../handlers/start.js';

const COLS = 4;

type TaxiConversation = Conversation<BotContext, BotContext>;

/**
 * Taxi-zone loading operator (Chișinău). Lightweight: pick the trip, send
 * geolocation, enter how many passengers he brought from the taxi/parking zone.
 * Saved to `taxi_zone_reports` (separate from the main report). The main Chișinău
 * operator later sees this number and confirms or overrides it.
 */
export async function taxiZoneReportConversation(
  conversation: TaxiConversation,
  ctx: BotContext
) {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('⛔ Drum interzis. Identitatea ta nu este recunoscută.');
    return;
  }
  const user = await conversation.external(() => getUserByTelegramId(telegramId));
  const effRole = user ? await conversation.external(() => effectiveRoleToday(user)) : null;
  if (!user || effRole !== 'TAXI_ZONE') {
    await ctx.reply('⛔ Această funcție e doar pentru operatorul din zona taxi.');
    return;
  }

  // Taxi-zone operates the Chișinău → Nord loading.
  const point = 'CHISINAU' as const;
  const direction = getDirectionForPoint(point);
  const reportDate = await conversation.external(() => getTodayDate());

  const allTrips = await conversation.external(() => getAllTripsForDirection(direction));
  if (allTrips.length === 0) {
    await ctx.reply('🌙 Nicio cursă activă azi.');
    return;
  }

  // ── LOOP: report multiple trips ────────────────────────
  while (true) {
    const reportedIds = new Set(
      await conversation.external(() =>
        getTaxiZoneReportedTripIds(reportDate).then(s => Array.from(s))
      )
    );
    const totalDone = allTrips.filter(t => reportedIds.has(t.id)).length;
    const nextTripId = allTrips.find(t => !reportedIds.has(t.id))?.id || null;

    const kb = new InlineKeyboard();
    let col = 0;
    for (const trip of allTrips) {
      const done = reportedIds.has(trip.id);
      const isNext = trip.id === nextTripId;
      const timeStr = formatTime(trip.departure_time);
      let label: string;
      let cbData: string;
      if (done) { label = `✅ ${timeStr}`; cbData = `done:${trip.id}`; }
      else if (isNext) { label = `▶ ${timeStr}`; cbData = `trip:${trip.id}`; }
      else { label = `🔒 ${timeStr}`; cbData = `locked:${trip.id}`; }
      kb.text(label, cbData);
      col++;
      if (col >= COLS) { kb.row(); col = 0; }
    }
    if (col > 0) kb.row();
    kb.text('✕ Închide', 'cancel');

    const nextTimeStr = nextTripId
      ? formatTime(allTrips.find(t => t.id === nextTripId)!.departure_time)
      : null;

    await ctx.reply(
      `🚕 Zona taxi — ${formatDate(reportDate)} — ${POINT_LABELS[point]}\n` +
      `Completate: ${totalDone}/${allTrips.length}` +
      (nextTimeStr ? `\n\n▶ Urmează: ${nextTimeStr}` : '\n\n✦ Toate curse completate.'),
      { reply_markup: kb }
    );

    let selectedTrip: (Trip & { route_name: string }) | null = null;
    while (true) {
      const cbCtx = await conversation.wait();
      if (cbCtx.message?.text === '/start') { await showMainMenu(cbCtx as BotContext); return; }
      if (!cbCtx.callbackQuery?.data) continue;
      const data = cbCtx.callbackQuery.data;
      if (data === 'cancel') {
        await cbCtx.answerCallbackQuery();
        await ctx.reply('🌙 Sesiune închisă. Drumul continuă mâine.');
        return;
      }
      if (data.startsWith('done:')) { await cbCtx.answerCallbackQuery({ text: 'Deja raportată ✅' }); continue; }
      if (data.startsWith('locked:')) { await cbCtx.answerCallbackQuery({ text: `⛔ Completează mai întâi ora ${nextTimeStr}` }); continue; }
      if (data.startsWith('trip:')) {
        await cbCtx.answerCallbackQuery();
        const tripId = data.replace('trip:', '');
        selectedTrip = allTrips.find(t => t.id === tripId) || null;
        if (selectedTrip) break;
      }
    }
    if (!selectedTrip) return;
    const trip = selectedTrip;

    // ── Geolocation (always, for the taxi-zone operator) ──
    let locationOk: boolean | null = null;
    const locationKb = new Keyboard().requestLocation('📍 Trimite locația').resized().oneTime();
    await ctx.reply(`📍 Trimite locația pentru cursa ${formatTime(trip.departure_time)}:`, { reply_markup: locationKb });
    let userLat: number | null = null;
    const locStart = await conversation.external(() => Date.now());
    while ((await conversation.external(() => Date.now())) - locStart < 60000) {
      const locCtx = await conversation.wait();
      if (locCtx.message?.text === '/start') {
        await ctx.reply('📍', { reply_markup: { remove_keyboard: true } });
        await showMainMenu(locCtx as BotContext);
        return;
      }
      if (locCtx.callbackQuery) { await locCtx.answerCallbackQuery({ text: '📍 Trimite locația mai întâi' }); continue; }
      if (locCtx.message?.location) {
        userLat = locCtx.message.location.latitude;
        const station = config.stations[point];
        const dist = haversineDistance(userLat, locCtx.message.location.longitude, station.lat, station.lon);
        locationOk = dist <= station.radiusM;
        await ctx.reply(
          locationOk
            ? `✅ Locație confirmată (${Math.round(dist)}m de stație).`
            : `⚠️ Ești la ${Math.round(dist)}m de stație. Raportarea continuă.`,
          { reply_markup: { remove_keyboard: true } }
        );
        break;
      }
      if (locCtx.message?.text) {
        await ctx.reply('Trimite locația folosind butonul 📍 de mai jos.', { reply_markup: locationKb });
      }
    }
    if (userLat === null) {
      await ctx.reply('⏱ Locație neprimită. Sesiunea se închide.', { reply_markup: { remove_keyboard: true } });
      return;
    }

    // ── Count or Absent ──
    const statusKb = new InlineKeyboard().text('Absent', 'status:ABSENT');
    await ctx.reply(
      `🚕 ${formatTime(trip.departure_time)}\n\nCâți pasageri ai adus din zona taxi? (scrie cifra sau apasă butonul)`,
      { reply_markup: statusKb }
    );
    let status: 'OK' | 'ABSENT' = 'OK';
    let passengersCount: number | null = null;
    while (true) {
      const inputCtx = await conversation.wait();
      if (inputCtx.message?.text === '/start') { await showMainMenu(inputCtx as BotContext); return; }
      if (inputCtx.callbackQuery?.data === 'status:ABSENT') { await inputCtx.answerCallbackQuery(); status = 'ABSENT'; break; }
      if (inputCtx.message?.text) {
        const num = parseInt(inputCtx.message.text, 10);
        if (isNaN(num) || num < 0 || num > 27) {
          await ctx.reply('Introdu un număr valid (0–27) sau apasă butonul:', { reply_markup: statusKb });
          continue;
        }
        passengersCount = num; status = 'OK'; break;
      }
    }

    // ── Save ──
    try {
      await conversation.external(() => createTaxiZoneReport({
        report_date: reportDate,
        trip_id: trip.id,
        status,
        passengers_count: passengersCount,
        location_ok: locationOk,
        created_by_user: user.id,
      }));
      await ctx.reply(
        status === 'ABSENT'
          ? `☑ ${formatTime(trip.departure_time)} — absent (zona taxi)`
          : `☑ ${formatTime(trip.departure_time)} — ${passengersCount} pas. (zona taxi)`
      );
    } catch (err: any) {
      if (err?.code === '23505') {
        await ctx.reply('⚠ Această cursă a fost deja raportată de zona taxi.');
      } else {
        console.error('Taxi-zone save error:', { code: err?.code, message: err?.message });
        await ctx.reply('Eroare la salvare. Contactați administratorul.');
      }
    }
  }
}
