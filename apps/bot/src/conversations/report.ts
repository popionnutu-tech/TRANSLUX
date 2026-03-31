import type { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from '../types.js';
import type { PointEnum, Driver, Trip } from '@translux/db';
import { POINT_LABELS } from '@translux/db';
import {
  getUserByTelegramId,
  getAllTripsForDirection,
  getActiveDrivers,
  getActiveVehicles,
  getDirectionForPoint,
  getReportedTripIds,
  createReport,
  validateDay,
  getUsedDriverIds,
  getUsedVehicleIds,
  createVehicle,
  needsReclamaCheck,
  getAssignmentForTrip,
} from '../services/db.js';
import { addViolationAndUpdate } from '../services/dailyDigest.js';
import { getTodayDate, formatTime, formatDate, haversineDistance, minutesLate } from '../utils.js';
import { config } from '../config.js';
import { showMainMenu } from '../handlers/start.js';

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
    await ctx.reply('⛔ Drum interzis. Identitatea ta nu este recunoscută.');
    return;
  }
  const user = await getUserByTelegramId(telegramId);
  if (!user) {
    await ctx.reply('⛔ Drum interzis. Identitatea ta nu este recunoscută.');
    return;
  }

  let point: PointEnum;

  if (user.point) {
    point = user.point;
  } else {
    // No point assigned — let user choose direction
    const dirKb = new InlineKeyboard()
      .text('Chișinău → Bălți', 'dir:CHISINAU')
      .text('Bălți → Chișinău', 'dir:BALTI');

    await ctx.reply('Alege direcția:', { reply_markup: dirKb });

    while (true) {
      const dirCtx = await conversation.wait();
      if (dirCtx.message?.text === '/start') {
        await showMainMenu(dirCtx as BotContext);
        return;
      }
      if (dirCtx.callbackQuery?.data?.startsWith('dir:')) {
        await dirCtx.answerCallbackQuery();
        point = dirCtx.callbackQuery.data.replace('dir:', '') as PointEnum;
        break;
      }
    }
  }

  const direction = getDirectionForPoint(point);
  const reportDate = getTodayDate();

  const allTrips = await getAllTripsForDirection(direction);
  if (allTrips.length === 0) {
    await ctx.reply('🌙 Nicio cursă activă azi. Contactează Maestrul.');
    return;
  }

  const drivers = await getActiveDrivers();
  const vehicles = await getActiveVehicles();

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
      `⚔ ${formatDate(reportDate)} — ${POINT_LABELS[point]}\n` +
      `Completate: ${totalDone}/${allTrips.length}` +
      (nextTimeStr ? `\n\n▶ Urmează: ${nextTimeStr}` : '\n\n✦ Toate curse completate.'),
      { reply_markup: kb }
    );

    // Wait for time selection
    let selectedTrip: (Trip & { route_name: string }) | null = null;
    while (true) {
      const cbCtx = await conversation.wait();

      // /start exits conversation and shows main menu
      if (cbCtx.message?.text === '/start') {
        await showMainMenu(cbCtx as BotContext);
        return;
      }

      // Skip non-callback updates
      if (!cbCtx.callbackQuery?.data) continue;
      const data = cbCtx.callbackQuery.data;

      if (data === 'cancel') {
        await cbCtx.answerCallbackQuery();
        await ctx.reply('🌙 Sesiune închisă. Drumul continuă mâine.');
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

        // /start exits conversation
        if (locCtx.message?.text === '/start') {
          await ctx.reply('📍', { reply_markup: { remove_keyboard: true } });
          await showMainMenu(locCtx as BotContext);
          return;
        }

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
        await ctx.reply('⏱ Locație neprimită. Sesiunea se închide.', {
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

      if (inputCtx.message?.text === '/start') {
        await showMainMenu(inputCtx as BotContext);
        return;
      }

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
    // Check for pre-assigned driver/vehicle
    const assignment = (status === 'OK' && point !== 'BALTI')
      ? await getAssignmentForTrip(trip.id, reportDate)
      : null;

    if (status === 'OK' && drivers.length > 0 && point !== 'BALTI') {
      let useAssignedDriver = false;

      // If there's an assigned driver, offer to confirm
      if (assignment) {
        const parts = assignment.driver_name.split(' ');
        const shortName = parts.length > 1
          ? `${parts[0]} ${parts.slice(1).map(p => p[0] + '.').join('')}`
          : assignment.driver_name;

        const confirmKb = new InlineKeyboard()
          .text(`✅ ${shortName}`, 'driver:confirm')
          .text('🔄 Altul', 'driver:change');

        await ctx.reply(`Șofer programat: ${shortName}`, { reply_markup: confirmKb });

        while (true) {
          const dCtx = await conversation.wait();
          if (dCtx.message?.text === '/start') {
            await showMainMenu(dCtx as BotContext);
            return;
          }
          if (!dCtx.callbackQuery?.data?.startsWith('driver:')) continue;
          await dCtx.answerCallbackQuery();
          const val = dCtx.callbackQuery.data.replace('driver:', '');
          if (val === 'confirm') {
            driverId = assignment.driver_id;
            useAssignedDriver = true;
            break;
          }
          if (val === 'change') break; // fall through to normal grid
        }
      }

      // Show normal driver grid if no assignment or user chose to change
      if (!useAssignedDriver) {
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
          const dCtx = await conversation.wait();
          if (dCtx.message?.text === '/start') {
            await showMainMenu(dCtx as BotContext);
            return;
          }
          if (!dCtx.callbackQuery?.data?.startsWith('driver:')) continue;
          await dCtx.answerCallbackQuery();
          const val = dCtx.callbackQuery.data.replace('driver:', '');
          if (val === 'none') { driverId = null; break; }
          driverId = val;
          break;
        }
      }
    }

    // ── Step 3b: Select Vehicle (grid layout) ──────────
    let vehicleId: string | null = null;
    if (status === 'OK' && point !== 'BALTI') {
      let useAssignedVehicle = false;

      // If there's an assigned vehicle, offer to confirm
      if (assignment?.vehicle_id && assignment.plate_number) {
        const confirmKb = new InlineKeyboard()
          .text(`✅ ${assignment.plate_number}`, 'vehicle:confirm')
          .text('🔄 Altul', 'vehicle:change');

        await ctx.reply(`Auto programat: ${assignment.plate_number}`, { reply_markup: confirmKb });

        while (true) {
          const vCtx = await conversation.wait();
          if (vCtx.message?.text === '/start') {
            await showMainMenu(vCtx as BotContext);
            return;
          }
          if (!vCtx.callbackQuery?.data?.startsWith('vehicle:')) continue;
          await vCtx.answerCallbackQuery();
          const val = vCtx.callbackQuery.data.replace('vehicle:', '');
          if (val === 'confirm') {
            vehicleId = assignment.vehicle_id;
            useAssignedVehicle = true;
            break;
          }
          if (val === 'change') break; // fall through to normal grid
        }
      }

      if (!useAssignedVehicle) {
      const usedVehicleIds = await getUsedVehicleIds(reportDate, point);
      const availableVehicles = vehicles.filter(v => !usedVehicleIds.has(v.id));

      const vehicleKb = new InlineKeyboard();
      let vcol = 0;
      for (const v of availableVehicles) {
        vehicleKb.text(v.plate_number, `vehicle:${v.id}`);
        vcol++;
        if (vcol >= DRIVER_COLS) { vehicleKb.row(); vcol = 0; }
      }
      if (vcol > 0) vehicleKb.row();
      vehicleKb.text('+ Adaugă auto', 'vehicle:add').text('— Fără auto', 'vehicle:none');

      await ctx.reply('Auto (nomenclator):', { reply_markup: vehicleKb });

      while (true) {
        const vCtx = await conversation.wait();
        if (vCtx.message?.text === '/start') {
          await showMainMenu(vCtx as BotContext);
          return;
        }
        if (!vCtx.callbackQuery?.data?.startsWith('vehicle:')) continue;
        await vCtx.answerCallbackQuery();
        const val = vCtx.callbackQuery.data.replace('vehicle:', '');
        if (val === 'none') { vehicleId = null; break; }
        if (val === 'add') {
          await ctx.reply('Scrie numărul auto (ex: 998TCP):');
          while (true) {
            const addCtx = await conversation.wait();
            if (addCtx.message?.text === '/start') {
              await showMainMenu(addCtx as BotContext);
              return;
            }
            const plate = addCtx.message?.text?.trim().toUpperCase().replace(/\s/g, '');
            if (plate && plate.length >= 4) {
              try {
                const newVehicle = await createVehicle(plate);
                vehicleId = newVehicle.id;
                await ctx.reply(`✅ ${newVehicle.plate_number} adăugat.`);
              } catch (err: any) {
                if (err?.code === '23505') {
                  // Already exists — find and use it
                  const existing = vehicles.find(v => v.plate_number === plate);
                  if (existing) {
                    vehicleId = existing.id;
                    await ctx.reply(`☑ ${plate} există deja, selectat.`);
                  } else {
                    await ctx.reply('⚠ Acest număr există deja.');
                    continue;
                  }
                } else {
                  await ctx.reply('⚠ Eroare la salvare. Încearcă din nou:');
                  continue;
                }
              }
              break;
            }
            await ctx.reply('Număr invalid. Scrie minim 4 caractere (ex: 998TCP):');
          }
          break;
        }
        vehicleId = val;
        break;
      }
      } // end if (!useAssignedVehicle)
    }

    // ── Step 4: Uniform + Aspect (one message) ────────
    let uniformOk: boolean | null = null;
    let exteriorOk: boolean | null = null;
    let autoCurat: boolean | null = null;
    let reclamaOk: boolean | null = null;
    let reclamaDeadline: string | null = null;

    if (status === 'OK' && point !== 'BALTI') {
      const compKb = new InlineKeyboard()
        .text('Totul OK ✓', 'comp:all_ok').row()
        .text('Fără uniformă', 'comp:no_uni').text('Aspect neîngrijit', 'comp:no_asp').row()
        .text('Ambele rău', 'comp:both_bad');

      await ctx.reply('Conformitate șofer:', { reply_markup: compKb });
      let compCtx;
      while (true) {
        compCtx = await conversation.wait();
        if (compCtx.message?.text === '/start') {
          await showMainMenu(compCtx as BotContext);
          return;
        }
        if (compCtx.callbackQuery?.data?.startsWith('comp:')) break;
      }
      await compCtx.answerCallbackQuery();
      const compVal = compCtx.callbackQuery!.data!.replace('comp:', '');

      switch (compVal) {
        case 'all_ok': uniformOk = true; exteriorOk = true; break;
        case 'no_uni': uniformOk = false; exteriorOk = true; break;
        case 'no_asp': uniformOk = true; exteriorOk = false; break;
        case 'both_bad': uniformOk = false; exteriorOk = false; break;
      }

      // ── Step 4b: Auto curat (vehicle cleanliness) ─────
      const curatKb = new InlineKeyboard()
        .text('Da ✓', 'curat:da')
        .text('Nu ✗', 'curat:nu');

      await ctx.reply('Auto curat?', { reply_markup: curatKb });

      while (true) {
        const curatCtx = await conversation.wait();
        if (curatCtx.message?.text === '/start') {
          await showMainMenu(curatCtx as BotContext);
          return;
        }
        if (curatCtx.callbackQuery?.data?.startsWith('curat:')) {
          await curatCtx.answerCallbackQuery();
          autoCurat = curatCtx.callbackQuery.data === 'curat:da';
          break;
        }
      }

      // ── Step 4c: Reclamă (conditional — only if vehicle needs check) ─
      const showReclama = vehicleId ? await needsReclamaCheck(vehicleId) : false;
      if (showReclama) {
        const reclamaKb = new InlineKeyboard()
          .text('Da ✓', 'reclama:da')
          .text('Nu ✗', 'reclama:nu');

        await ctx.reply('Reclamă OK?', { reply_markup: reclamaKb });

        while (true) {
          const recCtx = await conversation.wait();
          if (recCtx.message?.text === '/start') {
            await showMainMenu(recCtx as BotContext);
            return;
          }
          if (recCtx.callbackQuery?.data?.startsWith('reclama:')) {
            await recCtx.answerCallbackQuery();
            reclamaOk = recCtx.callbackQuery.data === 'reclama:da';
            break;
          }
        }

        // If reclama not OK — ask for deadline date
        if (reclamaOk === false) {
          const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }));
          const addDays = (d: Date, n: number) => {
            const r = new Date(d);
            r.setDate(r.getDate() + n);
            return r;
          };
          const fmt = (d: Date) => d.toISOString().slice(0, 10);
          const fmtLabel = (d: Date) =>
            `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

          const d1 = addDays(today, 1);
          const d3 = addDays(today, 3);
          const d7 = addDays(today, 7);

          const deadlineKb = new InlineKeyboard()
            .text(`Mâine (${fmtLabel(d1)})`, `dl:${fmt(d1)}`)
            .text(`+3 zile (${fmtLabel(d3)})`, `dl:${fmt(d3)}`)
            .text(`+7 zile (${fmtLabel(d7)})`, `dl:${fmt(d7)}`);

          await ctx.reply('Până când se rezolvă reclama?\n(sau trimite data: ZZ.LL.AAAA)', {
            reply_markup: deadlineKb,
          });

          while (true) {
            const dlCtx = await conversation.wait();
            if (dlCtx.message?.text === '/start') {
              await showMainMenu(dlCtx as BotContext);
              return;
            }
            if (dlCtx.callbackQuery?.data?.startsWith('dl:')) {
              await dlCtx.answerCallbackQuery();
              reclamaDeadline = dlCtx.callbackQuery.data.replace('dl:', '');
              break;
            }
            const txt = dlCtx.message?.text?.trim();
            if (txt) {
              const m = txt.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
              if (m) {
                const day = parseInt(m[1], 10);
                const month = parseInt(m[2], 10);
                const year = parseInt(m[3], 10);
                const parsed = new Date(year, month - 1, day);
                if (!isNaN(parsed.getTime()) && parsed > today) {
                  reclamaDeadline = fmt(parsed);
                  break;
                }
              }
              await ctx.reply('Format invalid. Trimite data: ZZ.LL.AAAA (în viitor)');
            }
          }
        }
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
        auto_curat: autoCurat,
        reclama_ok: reclamaOk,
        reclama_deadline: reclamaDeadline,
        vehicle_id: vehicleId,
        created_by_user: user.id,
        location_ok: needsLoc ? locationOk : null,
      });

      // Update daily digest (single editable message for all violations)
      const hasLocationViolation = needsLoc && !locationOk;
      const hasLateViolation = late > 10;
      if (hasLocationViolation || hasLateViolation) {
        try {
          await addViolationAndUpdate({
            time: formatTime(trip.departure_time),
            point: POINT_LABELS[point],
            operator: user.username ? `@${user.username}` : `#${user.telegram_id}`,
            locationBad: hasLocationViolation,
            distanceM: locationDistance != null ? Math.round(locationDistance) : null,
            late: hasLateViolation,
            minutesLate: late,
          });
        } catch (e) {
          console.error('Daily digest update error:', e);
        }
      }

      const driverFull = driverId ? drivers.find(d => d.id === driverId)?.full_name || '—' : '—';
      const driverParts = driverFull.split(' ');
      const driverName = driverParts.length > 1
        ? `${driverParts[0]} ${driverParts.slice(1).map(p => p[0] + '.').join('')}`
        : driverFull;

      if (status === 'ABSENT') {
        await ctx.reply(`☑ ${formatTime(trip.departure_time)} — absent`);
      } else if (status === 'FULL') {
        await ctx.reply(`☑ ${formatTime(trip.departure_time)} — microbuz complet`);
      } else {
        const passengerInfo = `☑ ${formatTime(trip.departure_time)} — ${passengersCount} pas.`;
        const driverInfo = point !== 'BALTI' ? ` | ${driverName}` : '';
        const warningParts: string[] = [];
        if (uniformOk === false) warningParts.push('uniformă');
        if (exteriorOk === false) warningParts.push('aspect');
        if (autoCurat === false) warningParts.push('auto murdar');
        if (reclamaOk === false) warningParts.push(`reclamă (până ${reclamaDeadline})`);
        const warnings = warningParts.length > 0 ? `\n⚠ ${warningParts.join(', ')}` : '';
        await ctx.reply(passengerInfo + driverInfo + warnings);
      }

      // ── Auto-validate day when all trips are reported ──
      const updatedReportedIds = await getReportedTripIds(reportDate, point);
      const updatedDone = allTrips.filter(t => updatedReportedIds.has(t.id)).length;
      if (updatedDone >= allTrips.length) {
        await validateDay(user.id, reportDate);
        await ctx.reply(
          `✦ MISIUNE ÎNDEPLINITĂ\n\n` +
          `Toate cele ${allTrips.length} curse au fost completate.\n\n` +
          `Drumul de azi e parcurs.\n` +
          `Odihnește-te. Noapte bună. 🌙`
        );
        return;
      }

    } catch (err: any) {
      if (err?.code === '23505') {
        await ctx.reply('⚠ Această cursă a fost deja înregistrată.');
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
