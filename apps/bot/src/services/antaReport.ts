import { sendAdminAlert } from './adminAlert.js';
import { formatDate } from '../utils.js';
import { config } from '../config.js';

interface AntaAnnouncement {
  date: string;   // YYYY-MM-DD
  title: string;
}

const ANTA_URL = 'https://anta.gov.md/anunturi/';
const FETCH_TIMEOUT_MS = 15_000;

/** Parse DD.MM.YYYY to YYYY-MM-DD */
function parseDate(raw: string): string | null {
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Fetch and parse announcements from ANTA website */
async function fetchAnnouncements(): Promise<AntaAnnouncement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(ANTA_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const results: AntaAnnouncement[] = [];

    // Actual Drupal HTML structure:
    //   <span class="field-content">12.05.2026 | Anunțuri</span>  </div>
    //   <h4 ...><span class="field-content"><a href="...">Title</a></span></h4>
    const pattern = /(\d{2}\.\d{2}\.\d{4})\s*\|\s*Anun.uri.*?<h\d[^>]*>.*?<a[^>]*>([^<]+)<\/a>/gs;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const date = parseDate(match[1]);
      const title = match[2].trim();
      if (date && title) {
        results.push({ date, title });
      }
    }

    return results;
  } finally {
    clearTimeout(timer);
  }
}

/** Get previous week range (Monday–Sunday) */
function getPreviousWeekRange(): { dateFrom: string; dateTo: string } {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: config.timezone })
  );
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;

  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - diffToMonday - 7);

  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  return {
    dateFrom: lastMonday.toISOString().slice(0, 10),
    dateTo: lastSunday.toISOString().slice(0, 10),
  };
}

/** Fetch ANTA announcements for the previous week and send report to admins */
export async function sendAntaWeeklyReport(): Promise<void> {
  const { dateFrom, dateTo } = getPreviousWeekRange();

  let announcements: AntaAnnouncement[];
  try {
    announcements = await fetchAnnouncements();
  } catch (err) {
    console.error('ANTA fetch error:', err);
    return;
  }

  const filtered = announcements.filter(a => a.date >= dateFrom && a.date <= dateTo);

  const fromDD = formatDate(dateFrom).slice(0, 5);
  const toFull = formatDate(dateTo);

  let msg = `📢 <b>ANTA — Anunțuri săptămânale</b>\n`;
  msg += `📅 ${fromDD} — ${toFull}\n\n`;

  if (filtered.length === 0) {
    msg += `✅ Nicio publicație nouă în această perioadă.`;
  } else {
    for (const a of filtered) {
      const dd = a.date.slice(8, 10);
      const mm = a.date.slice(5, 7);
      msg += `• ${dd}.${mm} — ${a.title}\n`;
    }
    msg += `\nTotal: ${filtered.length} anunțuri`;
  }

  await sendAdminAlert(msg);
  console.log(`ANTA weekly report sent: ${filtered.length} announcements for ${dateFrom} — ${dateTo}`);
}
