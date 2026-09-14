// Raportul săptămânal al adminilor (luni 08:00). Ion (14.09): «să nu mai vie info
// legate de șoferi și mașini mie — șoferi am setat săptămânal raport, mașini pe urmă»:
// neconformitățile șoferilor merg în grupa șoferilor ca imaginea de penalități
// (apps/admin driver-penalties), iar sarcinile reclamă pe auto ies din raport până
// se decide altceva. Rămân doar absențele operatorilor.
import { getOperatorAbsences } from './db.js';
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

  const absences = await getOperatorAbsences(dateFrom, dateTo);

  const period = `${formatDate(dateFrom)} — ${formatDate(dateTo)}`;

  let msg = `📊 <b>RAPORT SĂPTĂMÂNAL</b>\n`;
  msg += `📅 ${period}\n`;
  msg += `${'─'.repeat(28)}\n\n`;

  // ── Operatori ──
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
