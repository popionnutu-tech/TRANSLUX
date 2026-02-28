import type { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from '../types.js';
import type { PointEnum, Driver, Trip } from '@translux/db';
import { POINT_LABELS } from '@translux/db';
import {
  getUserByTelegramId,
  getAllTripsForDirection,
  getActiveDrivers,
  getDirectionForPoint,
  getReportedTripIds,
  createReport,
  validateDay,
  getUsedDriverIds,
} from '../services/db.js';
import { addViolation, updateDailyDigest } from '../services/dailyDigest.js';
import { getTodayDate, formatTime, formatDate, haversineDistance, minutesLate } from '../utils.js';
import { config } from '../config.js';

const COLS = 4;
const DRIVER_COLS = 2;

type ReportConversation = Conversation<BotContext, BotContext>;

/** Check if a trip time requires geolocation for a given point */
function requiresLocation(point: PointEnum, departureTime: string): boolean {
  if (point === 'BALTI') return true; // Bălți: all trips require location
  // Chișinău: all trips EXCEPT 06:55 and 20:00
  const timeHHMM = departureTime.slice(0, 5);
  return !(config.chisinauExemptTimes as readonly string[]).includes(timeHHMM);
}

export async function reportConversation(
  conversation: ReportConversation,
  ctx: BotContext
) {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('Eroare: utilizator neautorizat.');
    return;
  }
  const user = await getUserByTelegramId(telegramId);
  if (!user || !user.point) {
    await ctx.reply('Eroare: utilizator neautorizat.');
    return;
  }

  const point: PointEnum = user.point;
  const direction = getDirectionForPoint(point);
  const reportDate = getTodayDate();

  const allTrips = await getAllTripsForDirection(direction);
  if (allTrips.length === 0) {
    await ctx.reply('Nu există curse active. Contactează administratorul.');
    return;
  }

  const drivers = await getActiveDrivers();

  // ── LOOP: report multiple trips ────────────────────────
  while (true) {
    const reportedIds = await getReportedTripIds(reportDate, point);
    const totalDone = allTrips.filter(t => reportedIds.has(t.id)).length;

    // Find first unreported trip (sequential order)
    const nextTripId = allTrips.find(t => !reportedIds.has(t.id))?.id || null;

    // Build time grid
    const kb = new InlineKeyboard();
    let col = 0;
    for (const trip of allTrips) {
      const done = reportedIds.has(trip.id);
      const isNext = trip.id === nextTripId;
      const timeStr = formatTime(trip.departure_time);
      let label: string;
      let cbData: string;

      if (done) {
        label = `✅ ${timeStr}`;
        cbData = `done:${trip.id}`;
      } else if (isNext) {
        label = `▶ ${timeStr}`;
        cbData = `trip:${trip.id}`;
      } else {
        label = `🔒 ${timeStr}`;
        cbData = `locked:${trip.id}`;
      }

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
      `📋 ${formatDate(reportDate)} — ${POINT_LABELS[point]}\n` +
      `Completate: ${totalDone}/${allTrips.length}` +
      (nextTimeStr ? `\n\n▶ Următoarea: ${nextTimeStr}` : '\n\n✅ Toate completate!'),
      { reply_markup: kb }
    );

    // Wait for time selection
    let selectedTrip: (Trip & { route_name: string }) | null = null;
    while (true) {
      const cbCtx = await conversation.waitForCallbackQuery(/.+/);
      const data = cbCtx.callbackQuery.data;

      if (data === 'cancel') {
        await cbCtx.answerCallbackQuery();
        await ctx.reply('Sesiune închisă.');
        return;
      }
      if (data.startsWith('done:')) {
        await cbCtx.answerCallbackQuery({ text: 'Deja raportată ✅' });
        continue;
      }
      if (data.startsWith('locked:')) {
        await cbCtx.answerCallbackQuery({
          text: `⛔ Completează mai întâi ora ${nextTimeStr}`,
        });
        continue;
      }
      if (data.startsWith('trip:')) {
        await cbCtx.answerCallbackQuery();
        const tripId = data.replace('trip:', '');
        selectedTrip = allTrips.find(t => t.id === tripId) || null;
        if (selectedTrip) break;
      }
    }

    if (!selectedTrip) return;
    const trip = selectedTrip;

    // ── Request geolocation for this trip ────────────────
    const needsLoc = requiresLocation(point, trip.departure_time);
    let userLat: number | null = null;
    let userLon: number | null = null;
    let locationDistance: number | null = null;
    let locationOk: boolean = false;

    if (needsLoc) {
      const locationKb = new Keyboard()
        .requestLocation('📍 Trimite locația')
        .resized()
        .oneTime();

      await ctx.reply(
        `📍 Trimite locația pentru cursa ${formatTime(trip.departure_time)}:`,
        { reply_markup: locationKb }
      );

      const locStart = Date.now();
      while (Date.now() - locStart < 60000) {
        const locCtx = await conversation.wait();

        // Handle stray callback queries (user clicking old buttons)
        if (locCtx.callbackQuery) {
          await locCtx.answerCallbackQuery({ text: '📍 Trimite locația mai întâi' });
          continue;
        }

        if (locCtx.message?.location) {
          userLat = locCtx.message.location.latitude;
          userLon = locCtx.message.location.longitude;

          const station = config.stations[point];
          locationDistance = haversineDistance(userLat, userLon, station.lat, station.lon);
          locationOk = locationDistance <= station.radiusM;

          if (locationOk) {
            await ctx.reply(`✅ Locație confirmată (${Math.round(locationDistance)}m de stație).`, {
              reply_markup: { remove_keyboard: true },
            });
          } else {
            await ctx.reply(
              `⚠️ Ești la ${Math.round(locationDistance)}m de stație (limita: ${station.radiusM}m).\nRaportarea continuă, dar administratorul va fi notificat.`,
              { reply_markup: { remove_keyboard: true } }
            );
          }
          break;
        }

        if (locCtx.message?.text) {
          await ctx.reply('Trimite locația folosind butonul 📍 de mai jos.', {
            reply_markup: locationKb,
          });
        }
      }

      if (userLat === null) {
        await ctx.reply('⏱ Nu ai trimis locația. Sesiunea se închide.', {
          reply_markup: { remove_keyboard: true },
        });
        return;
      }
    }

    // ── Check late submission (>10 min after departure) ──
    const late = minutesLate(trip.departure_time);
    let lateWarning = false;
    if (late > 10) {
      lateWarning = true;
      await ctx.reply(
        `⏰ Întârziere ${late} min față de ora cursei ${formatTime(trip.departure_time)}.\n` +
        `Poți continua, dar administratorul va fi notificat.`
      );
    }

    // ── Step 2: Passengers or ABSENT / FULL ────────────
    const statusKb = new InlineKeyboard().text('Absent', 'status:ABSENT');
    if (point === 'BALTI') {
      statusKb.text('Microbuzul full', 'status:FULL');
    }

    await ctx.reply(
      `⏱ ${formatTime(trip.departure_time)}\n\nCâți pasageri? (scrie cifra sau apasă butonul)`,
      { reply_markup: statusKb }
    );

    let status: 'OK' | 'ABSENT' | 'FULL' = 'OK';
    let passengersCount: number | null = null;

    while (true) {
      const inputCtx = await conversation.wait();

      if (inputCtx.callbackQuery?.data === 'status:ABSENT') {
        await inputCtx.answerCallbackQuery();
        status = 'ABSENT';
        break;
      }
      if (inputCtx.callbackQuery?.data === 'status:FULL') {
        await inputCtx.answerCallbackQuery();
        status = 'FULL';
        break;
      }

      if (inputCtx.message?.text) {
        const num = parseInt(inputCtx.message.text, 10);
        if (isNaN(num) || num < 0 || num > 27) {
          await ctx.reply('Introdu un număr valid (0–27) sau apasă butonul:',
            { reply_markup: statusKb }
          );
          continue;
        }
        passengersCount = num;
        status = 'OK';
        break;
      }
    }

    // ── Step 3: Select Driver (grid layout) — skip if ABSENT/FULL ──
    let driverId: string | null = null;
    if (status === 'OK' && drivers.length > 0 && point !== 'BALTI') {
      const usedDriverIds = await getUsedDriverIds(reportDate, point);
      const availableDrivers = drivers.filter(d => !usedDriverIds.has(d.id));

      const driverKb = new InlineKeyboard();
      let dcol = 0;
      for (const d of availableDrivers) {
        const parts = d.full_name.split(' ');
        const shortName = parts.length > 1
          ? `${parts[0]} ${parts.slice(1).map(p => p[0] + '.').join('')}`
          : d.full_name;
        driverKb.text(shortName, `driver:${d.id}`);
        dcol++;
        if (dcol >= DRIVER_COLS) { driverKb.row(); dcol = 0; }
      }
      if (dcol > 0) driverKb.row();
      driverKb.text('— Fără șofer', 'driver:none');

      await ctx.reply('Șoferul:', { reply_markup: driverKb });

      while (true) {
        const dCtx = await conversation.waitForCallbackQuery(/^driver:/);
        await dCtx.answerCallbackQuery();
        const val = dCtx.callbackQuery.data.replace('driver:', '');
        if (val === 'none') { driverId = null; break; }
        driverId = val;
        break;
      }
    }

    // ── Step 4: Uniform + Aspect (one message) ────────
    let uniformOk: boolean | null = null;
    let exteriorOk: boolean | null = null;

    if (status === 'OK' && point !== 'BALTI') {
      const compKb = new InlineKeyboard()
        .text('Totul OK ✓', 'comp:all_ok').row()
        .text('Fără uniformă', 'comp:no_uni').text('Aspect neîngrijit', 'comp:no_asp').row()
        .text('Ambele rău', 'comp:both_bad');

      await ctx.reply('Conformitate șofer:', { reply_markup: compKb });
      const compCtx = await conversation.waitForCallbackQuery(/^comp:/);
      await compCtx.answerCallbackQuery();
      const compVal = compCtx.callbackQuery.data.replace('comp:', '');

      switch (compVal) {
        case 'all_ok': uniformOk = true; exteriorOk = true; break;
        case 'no_uni': uniformOk = false; exteriorOk = true; break;
        case 'no_asp': uniformOk = true; exteriorOk = false; break;
        case 'both_bad': uniformOk = false; exteriorOk = false; break;
      }
    }

    // ── Save ───────────────────────────────────────────
    try {
      await createReport({
        report_date: reportDate,
        point,
        trip_id: trip.id,
        driver_id: driverId,
        status,
        passengers_count: passengersCount,
        exterior_ok: exteriorOk,
        uniform_ok: uniformOk,
        created_by_user: user.id,
      });

      // Update daily digest (single editable message for all violations)
      const hasLocationViolation = needsLoc && !locationOk;
      const hasLateViolation = late > 10;
      if (hasLocationViolation || hasLateViolation) {
        try {
          addViolation({
            time: formatTime(trip.departure_time),
            point: POINT_LABELS[point],
            operator: user.username ? `@${user.username}` : `#${user.telegram_id}`,
            locationBad: hasLocationViolation,
            distanceM: locationDistance != null ? Math.round(locationDistance) : null,
            late: hasLateViolation,
            minutesLate: late,
          });
          await updateDailyDigest();
        } catch (e) {
          console.error('Daily digest update error:', e);
        }
      }

      const driverName = driverId ? drivers.find(d => d.id === driverId)?.full_name || '—' : '—';

      if (status === 'ABSENT') {
        await ctx.reply(`✓ ${formatTime(trip.departure_time)} — absent`);
      } else if (status === 'FULL') {
        await ctx.reply(`✓ ${formatTime(trip.departure_time)} — microbuzul full`);
      } else {
        await ctx.reply(
          `✓ ${formatTime(trip.departure_time)} — ${passengersCount} pas. | ${driverName}` +
          (uniformOk === false || exteriorOk === false
            ? `\n⚠ ${uniformOk === false ? 'uniformă' : ''} ${exteriorOk === false ? 'aspect' : ''}`
            : '')
        );
      }

      // ── Auto-validate day when all trips are reported ──
      const updatedReportedIds = await getReportedTripIds(reportDate, point);
      const updatedDone = allTrips.filter(t => updatedReportedIds.has(t.id)).length;
      if (updatedDone >= allTrips.length) {
        await validateDay(user.id, reportDate);
        await ctx.reply(
          `✅ Toate cele ${allTrips.length} curse au fost completate!\n\n` +
          `🌙 Seară bună și somn ușor!\n` +
          `TRANSLUX îți mulțumește pentru munca ta. 🙏`
        );
        return;
      }

    } catch (err: any) {
      if (err?.code === '23505') {
        await ctx.reply('⚠ Deja raportată.');
      } else {
        console.error('Report save error:', err);
        const detail = [
          err?.code && `code: ${err.code}`,
          err?.message,
          err?.details,
          err?.hint,
        ].filter(Boolean).join('\n') || JSON.stringify(err);
        await ctx.reply(`Eroare la salvare.\n\n🔍 ${detail}`);
      }
    }
  }
}
