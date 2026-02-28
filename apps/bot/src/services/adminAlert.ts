import type { Api } from 'grammy';

let adminChatIds: Set<number> = new Set();
let botApi: Api | null = null;

export function initAdminAlert(api: Api) {
  botApi = api;
}

export function registerAdmin(chatId: number) {
  adminChatIds.add(chatId);
}

export function unregisterAdmin(chatId: number) {
  adminChatIds.delete(chatId);
}

export function getAdminCount(): number {
  return adminChatIds.size;
}

export function getAdminChatIds(): Set<number> {
  return adminChatIds;
}

export function getBotApi(): Api | null {
  return botApi;
}

export async function sendAdminAlert(message: string) {
  if (!botApi || adminChatIds.size === 0) return;
  for (const chatId of adminChatIds) {
    try {
      await botApi.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (err) {
      console.error(`Failed to send alert to admin ${chatId}:`, err);
    }
  }
}

export async function sendLocationAlert(
  controllerName: string,
  point: string,
  tripTime: string,
  distanceM: number,
  lat: number,
  lon: number
) {
  const msg =
    `🚨 <b>ALERTĂ LOCAȚIE</b>\n\n` +
    `Operator: <b>${controllerName}</b>\n` +
    `Punct: <b>${point}</b>\n` +
    `Cursă: <b>${tripTime}</b>\n` +
    `Distanță de stație: <b>${Math.round(distanceM)}m</b>\n` +
    `Coordonate: ${lat.toFixed(5)}, ${lon.toFixed(5)}\n\n` +
    `⚠️ Raportul a fost trimis NU de la locul de muncă!`;
  await sendAdminAlert(msg);
}

export async function sendLateAlert(
  controllerName: string,
  point: string,
  tripTime: string,
  minutesLate: number
) {
  const msg =
    `⏰ <b>ALERTĂ ÎNTÂRZIERE</b>\n\n` +
    `Operator: <b>${controllerName}</b>\n` +
    `Punct: <b>${point}</b>\n` +
    `Cursă: <b>${tripTime}</b>\n` +
    `Întârziere: <b>${minutesLate} min</b>\n\n` +
    `⚠️ Raportul a fost introdus cu întârziere!`;
  await sendAdminAlert(msg);
}
