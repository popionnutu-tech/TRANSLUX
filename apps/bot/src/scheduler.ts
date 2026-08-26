import { config } from './config.js';
import { generateRecurringTasks, expireStaleRecurringTasks, autoVerifyTiktokTasks } from './services/db.js';
import { sendWeeklyReport } from './services/weeklyReport.js';
import { sendSmmWeeklyReport } from './services/smmWeeklyReport.js';
import { collectSmmData, aggregateDailyStats, aggregateRangeStats } from './services/smm.js';
import { sendCompactDigest } from './services/dailyDigest.js';
import { sendAntaWeeklyReport } from './services/antaReport.js';
import { sweepTaskBoards } from './services/taskBoard.js';
import { sendAdminAlert, escapeHtml } from './services/adminAlert.js';
import { sendVoiceLessonDigest } from './services/voiceLessons.js';

const CHECK_INTERVAL_MS = 60 * 1000; // check every minute
const SEND_DAY = 1;   // Monday
const SEND_HOUR = 8;  // 08:00
const SEND_MINUTE = 0;

let lastSentWeek = '';

function getCurrentWeekId(): string {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: config.timezone })
  );
  const year = now.getFullYear();
  // ISO week number
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((now.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${year}-W${week}`;
}

function isTimeToSend(): boolean {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: config.timezone })
  );
  return now.getDay() === SEND_DAY && now.getHours() === SEND_HOUR && now.getMinutes() === SEND_MINUTE;
}

export function scheduleWeeklyReport(): void {
  console.log('Weekly report scheduler started (Monday 08:00 Europe/Chisinau)');

  setInterval(async () => {
    if (!isTimeToSend()) return;

    const weekId = getCurrentWeekId();
    if (lastSentWeek === weekId) return; // already sent this week

    lastSentWeek = weekId;

    try {
      await sendWeeklyReport();
    } catch (err) {
      console.error('Weekly report error:', err);
    }

    try {
      await sendAntaWeeklyReport();
    } catch (err) {
      console.error('ANTA weekly report error:', err);
    }
  }, CHECK_INTERVAL_MS);
}

// ── Daily Digest Scheduler (20:30) ─────────────────

const DIGEST_HOUR = 20;
const DIGEST_MINUTE = 30;

let lastSentDigestDate = '';

export function scheduleDailyDigest(): void {
  console.log('Daily digest scheduler started (20:30 Europe/Chisinau)');

  setInterval(async () => {
    const now = getNowInTz();
    if (now.getHours() !== DIGEST_HOUR || now.getMinutes() !== DIGEST_MINUTE) return;

    const todayStr = now.toISOString().slice(0, 10);
    if (lastSentDigestDate === todayStr) return;

    lastSentDigestDate = todayStr;

    try {
      await sendCompactDigest();
    } catch (err) {
      console.error('Daily digest error:', err);
    }
  }, CHECK_INTERVAL_MS);
}

// ── SMM Schedulers ─────────────────────────────────

const SMM_WEEKLY_DAY = 0;    // Sunday
const SMM_WEEKLY_HOUR = 18;
const SMM_DAILY_HOUR = 23;

let lastSentSmmWeek = '';
let lastSmmDailyCollect = '';

function getNowInTz() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: config.timezone })
  );
}

const SMM_RETRO_DAY = 1;   // Monday
const SMM_RETRO_HOUR = 3;  // 03:00

let lastSmmRetroWeek = '';

function getPreviousMonthRange(): { dateFrom: string; dateTo: string } {
  const now = getNowInTz();
  const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { dateFrom: fmt(firstDayPrevMonth), dateTo: fmt(lastDayPrevMonth) };
}

export function scheduleSmmJobs(): void {
  console.log('SMM schedulers started (daily 23:00, weekly Sun 18:00, retro Mon 03:00)');

  setInterval(async () => {
    const now = getNowInTz();
    const todayStr = now.toISOString().slice(0, 10);

    // Daily collection at 23:00
    if (now.getHours() === SMM_DAILY_HOUR && now.getMinutes() === 0) {
      if (lastSmmDailyCollect !== todayStr) {
        lastSmmDailyCollect = todayStr;
        try {
          await collectSmmData();
          await aggregateDailyStats(todayStr);
          console.log(`SMM daily data collected for ${todayStr}`);
          // Auto-verificare TikTok: închide sarcinile recurente cu ≥2 video azi
          const closed = await autoVerifyTiktokTasks(todayStr);
          if (closed > 0) console.log(`TikTok auto-verify: ${closed} sarcină(i) închisă(e) pentru ${todayStr}`);
        } catch (err) {
          console.error('SMM daily collection error:', err);
        }
      }
    }

    // Weekly report on Sunday at 18:00
    if (now.getDay() === SMM_WEEKLY_DAY && now.getHours() === SMM_WEEKLY_HOUR && now.getMinutes() === 0) {
      const weekId = getCurrentWeekId();
      if (lastSentSmmWeek !== weekId) {
        lastSentSmmWeek = weekId;
        try {
          await sendSmmWeeklyReport();
        } catch (err) {
          console.error('SMM weekly report error:', err);
        }
      }
    }

    // Weekly retroactive update: Monday 03:00 — re-fetch metrics and re-aggregate previous month
    if (now.getDay() === SMM_RETRO_DAY && now.getHours() === SMM_RETRO_HOUR && now.getMinutes() === 0) {
      const weekId = getCurrentWeekId();
      if (lastSmmRetroWeek !== weekId) {
        lastSmmRetroWeek = weekId;
        try {
          const { dateFrom, dateTo } = getPreviousMonthRange();
          await collectSmmData();
          await aggregateRangeStats(dateFrom, dateTo);
          console.log(`SMM retro update done for ${dateFrom} — ${dateTo}`);
        } catch (err) {
          console.error('SMM retro update error:', err);
        }
      }
    }
  }, CHECK_INTERVAL_MS);
}

// ── Recurring tasks generator (07:00) ──────────────

const RECURRING_HOUR = 7;
let lastRecurringDate = '';
let lastRecurringAlertDate = '';
let recurringRunning = false;

export function scheduleRecurringGenerator(): void {
  console.log('Recurring tasks generator started (>=07:00 Europe/Chisinau, cu recuperare)');

  setInterval(async () => {
    const now = getNowInTz();
    const todayStr = now.toISOString().slice(0, 10);
    if (lastRecurringDate === todayStr) return; // anti-dubl per proces; +DB last_generated_date la nivel de șablon
    // Fereastră cu recuperare: orice tick de la 07:00 încolo, nu doar minutul exact — un restart
    // la fix 07:00 nu mai costă ziua. Sarcinile cu termenul deja trecut le sare generateRecurringTasks
    // per șablon, iar dublurile le oprește claim-ul din DB.
    if (now.getHours() < RECURRING_HOUR) return;
    if (recurringRunning) return;

    recurringRunning = true;
    try {
      // Întâi curățăm instanțele de ieri (o singură sarcină vie per șablon), apoi generăm ziua de azi.
      // Curățenia are try/catch propriu INTENȚIONAT: dacă pică, ziua trebuie totuși generată —
      // altfel un UPDATE eșuat ar lăsa executantul fără sarcini (uborka blochează producția).
      try {
        const expired = await expireStaleRecurringTasks();
        if (expired > 0) console.log(`Recurring: ${expired} sarcină(i) expirată(e) închisă(e)`);
      } catch (err) {
        console.error('Recurring expire error:', err);
      }
      const n = await generateRecurringTasks();
      // Spre deosebire de scheduler-ele vecine (rapoarte), ziua se închide doar la succes:
      // aici reluarea e sigură (claim-ul din DB oprește dublurile), la rapoarte NU e (ar dubla mesajul).
      lastRecurringDate = todayStr;
      console.log(`Recurring: created ${n} task(s) for ${todayStr}`);
    } catch (err) {
      console.error('Recurring generator error:', err);
      if (lastRecurringAlertDate !== todayStr) {
        lastRecurringAlertDate = todayStr; // un singur alert pe zi, reîncercările continuă tăcut
        await sendAdminAlert(`⚠️ <b>Generator sarcini recurente</b>: eroare la rularea de azi (reîncerc la fiecare minut): ${escapeHtml(String((err as Error)?.message ?? err))}`);
      }
    } finally {
      recurringRunning = false;
    }
  }, CHECK_INTERVAL_MS);
}

// ── Уроки голосового агента (>=08:00, с recuperare) ────────────────
// Рассылает админам pending-уроки ночного learner-а с кнопками ✓/✗.
// Окно «любой тик после 08:00» вместо точной минуты: рестарт Railway в 08:00
// не съедает день. Двойную рассылку держит claim по notified_at в БД, поэтому
// день закрывается только после успешного прогона (как у recurring).

const VOICE_LESSONS_HOUR = 8;
let lastVoiceLessonsDate = '';

export function scheduleVoiceLessonDigest(): void {
  console.log('Voice lessons digest started (>=08:00 Europe/Chisinau, cu recuperare)');

  setInterval(async () => {
    const now = getNowInTz();
    const todayStr = now.toISOString().slice(0, 10);
    if (lastVoiceLessonsDate === todayStr) return;
    if (now.getHours() < VOICE_LESSONS_HOUR) return;
    try {
      const n = await sendVoiceLessonDigest();
      lastVoiceLessonsDate = todayStr;
      if (n > 0) console.log(`Voice lessons: sent ${n}`);
    } catch (err) {
      console.error('Voice lessons digest error:', err);
    }
  }, CHECK_INTERVAL_MS);
}

// ── Task board sweep (зеркалирование задач Vlad в группу) ──────────
// Каждую минуту доливает в привязанные группы новые активные задачи
// (ловит задачи из ЛЮБОГО источника — бот или админка). No-op, если привязок нет.
export function scheduleTaskBoardSweep(): void {
  console.log('Task board sweep started (every 60s)');

  setInterval(async () => {
    try {
      const n = await sweepTaskBoards();
      if (n > 0) console.log(`Task board: posted ${n} task(s)`);
    } catch (err) {
      console.error('Task board sweep error:', err);
    }
  }, CHECK_INTERVAL_MS);
}
