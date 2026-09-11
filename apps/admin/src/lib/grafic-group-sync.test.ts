import { describe, it, expect, vi, beforeEach } from 'vitest';

// O zi = o imagine în grupa Mejgorod (Ion, 11.09): când pleacă graficul nou pe
// aceeași zi, cel precedent se șterge. Ordinea contează: întâi noul, apoi
// ștergerea — dacă trimiterea pică, vechiul rămâne.

const upsert = vi.fn(async () => ({ error: null }));
let existingRow: Record<string, unknown> | null = null;

vi.mock('./supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) }) }),
      upsert,
    }),
  }),
}));

const cursa = {
  crm_route_id: 1, time_nord: '05:00', dest_to: 'Chișinău - Briceni', time_chisinau: '14:00',
  driver_id: 'd1', driver_full_name: 'Ion Ion', driver_name: 'Ion', vehicle_plate: 'AAA111',
  vehicle_plate_retur: null, cancelled: false,
};
vi.mock('./grafic-data', () => ({ loadGraficPages: async () => ({ pages: [[cursa]] }) }));
vi.mock('./schedule-image', () => ({ generateScheduleImage: async () => Buffer.from('png') }));

const sendTelegramPhoto = vi.fn<(...a: unknown[]) => Promise<{ ok: boolean; messageId: number | null }>>();
const deleteTelegramMessage = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => true);
vi.mock('./telegram-notify', () => ({
  sendTelegramPhoto: (...a: unknown[]) => sendTelegramPhoto(...a),
  deleteTelegramMessage: (...a: unknown[]) => deleteTelegramMessage(...a),
  escapeHtml: (s: string) => s,
}));

import { sendGraficImageToGroup } from './grafic-group-sync';

const CHAT = '-100123';

describe('sendGraficImageToGroup: o zi = o imagine în grupă', () => {
  beforeEach(() => {
    sendTelegramPhoto.mockReset();
    deleteTelegramMessage.mockClear();
    upsert.mockClear();
    existingRow = null;
  });

  it('prima trimitere: nu are ce șterge', async () => {
    sendTelegramPhoto.mockResolvedValue({ ok: true, messageId: 10 });
    const res = await sendGraficImageToGroup('2026-09-12', { chatId: CHAT, manual: true });
    expect(res.error).toBeUndefined();
    expect(deleteTelegramMessage).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('retrimiterea pe aceeași zi: pleacă imaginea nouă, apoi se șterge cea veche', async () => {
    existingRow = { send_count: 1, snapshot: {}, sent_by: 'u1', telegram_message_id: 10 };
    sendTelegramPhoto.mockResolvedValue({ ok: true, messageId: 11 });
    const res = await sendGraficImageToGroup('2026-09-12', { chatId: CHAT, manual: true });
    expect(res.error).toBeUndefined();
    expect(deleteTelegramMessage).toHaveBeenCalledWith(CHAT, 10);
    expect(sendTelegramPhoto.mock.invocationCallOrder[0]).toBeLessThan(deleteTelegramMessage.mock.invocationCallOrder[0]);
    const row = (upsert.mock.calls[0] as unknown[])[0] as { telegram_message_id: number; send_count: number };
    expect(row.telegram_message_id).toBe(11);
    expect(row.send_count).toBe(2);
  });

  it('Telegram refuză imaginea nouă: cea veche rămâne în grupă', async () => {
    existingRow = { send_count: 1, snapshot: {}, sent_by: 'u1', telegram_message_id: 10 };
    sendTelegramPhoto.mockResolvedValue({ ok: false, messageId: null });
    const res = await sendGraficImageToGroup('2026-09-12', { chatId: CHAT, manual: true });
    expect(res.error).toBeTruthy();
    expect(deleteTelegramMessage).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('ștergerea ratată (mesaj vechi de peste 48 h) nu strică trimiterea', async () => {
    existingRow = { send_count: 1, snapshot: {}, sent_by: 'u1', telegram_message_id: 10 };
    sendTelegramPhoto.mockResolvedValue({ ok: true, messageId: 12 });
    deleteTelegramMessage.mockResolvedValueOnce(false);
    const res = await sendGraficImageToGroup('2026-09-12', { chatId: CHAT, manual: true });
    expect(res.error).toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
