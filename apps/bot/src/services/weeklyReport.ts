import { getDriverViolations, getOperatorAbsences } from './db.js';
import { sendAdminAlert } from './adminAlert.js';
import { formatDate } from '../utils.js';
import { config } from '../config.js';
import { POINT_LABELS } from '@translux/db';

/** Get previous week range (Monday–Sunday) relative to today */
function getPreviousWeekRange(): { dateFrom: string; dateTo: string } {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: config.timezone })
  );
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;

  // Last Monday = this Monday - 7
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - diffToMonday - 7);

  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  return {
    dateFrom: lastMonday.toISOString().slice(0, 10),
    dateTo: lastSunday.toISOString().slice(0, 10),
  };
}

/** Build and send the weekly report to all registered admins */
export async function sendWeeklyReport(): Promise<void> {
  const { dateFrom, dateTo } = getPreviousWeekRange();

  const [violations, absences] = await Promise.all([
    getDriverViolations(dateFrom, dateTo),
    getOperatorAbsences(dateFrom, dateTo),
  ]);

  const period = `${formatDate(dateFrom)} — ${formatDate(dateTo)}`;

  let msg = `📊 <b>RAPORT SĂPTĂMÂNAL</b>\n`;
  msg += `📅 ${period}\n`;
  msg += `${'─'.repeat(28)}\n\n`;

  // ── 1. Drivers ──
  msg += `🚍 <b>ȘOFERI — Neconformități</b>\n\n`;

  if (violations.length === 0) {
    msg += `✅ Nicio neconformitate în perioada raportată.\n`;
  } else {
    for (const v of violations) {
      const issues: string[] = [];
      if (v.uniform_count > 0) issues.push(`uniformă ×${v.uniform_count}`);
      if (v.aspect_count > 0) issues.push(`aspect neîngrijit ×${v.aspect_count}`);
      msg += `• <b>${v.driver_name}</b> — ${issues.join(', ')}\n`;
    }
  }

  msg += `\n${'─'.repeat(28)}\n\n`;

  // ── 2. Operators ──
  msg += `🧍‍♂️ <b>OPERATORI — Absențe</b>\n\n`;

  if (absences.length === 0) {
    msg += `✅ Toți operatorii au fost prezenți.\n`;
  } else {
    for (const a of absences) {
      const pointLabel = POINT_LABELS[a.point as keyof typeof POINT_LABELS] || a.point;
      msg += `• <b>@${a.username}</b> (${pointLabel}) — ${a.absence_count} zile absent\n`;
    }
  }

  await sendAdminAlert(msg);
  console.log(`Weekly report sent for period ${period}`);
}
