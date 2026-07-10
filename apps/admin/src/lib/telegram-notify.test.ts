import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('./supabase', () => ({
  getSupabase: () => ({ from: fromMock }),
}));

import { sendTelegram, alertAdmins } from './telegram-notify';

describe('telegram-notify', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'TEST_TOKEN');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('sendTelegram вызывает Bot API с chat_id и HTML', async () => {
    const ok = await sendTelegram(42, '<b>hi</b>');
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botTEST_TOKEN/sendMessage');
    expect(JSON.parse(init.body)).toEqual({ chat_id: 42, text: '<b>hi</b>', parse_mode: 'HTML' });
  });

  it('sendTelegram возвращает false при ошибке fetch, не бросает', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    await expect(sendTelegram(42, 'x')).resolves.toBe(false);
  });

  it('sendTelegram возвращает false без токена', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    await expect(sendTelegram(42, 'x')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('alertAdmins шлёт каждому активному админу с telegram_id', async () => {
    const not = vi.fn().mockResolvedValue({ data: [{ telegram_id: 1 }, { telegram_id: 2 }] });
    const eq2 = vi.fn().mockReturnValue({ not });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    fromMock.mockReturnValue({ select });

    await alertAdmins('alerta');
    expect(fromMock).toHaveBeenCalledWith('users');
    expect(eq1).toHaveBeenCalledWith('role', 'ADMIN');
    expect(eq2).toHaveBeenCalledWith('active', true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('alertAdmins логирует ошибку запроса и не шлёт сообщения', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const not = vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } });
    const eq2 = vi.fn().mockReturnValue({ not });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    fromMock.mockReturnValue({ select });

    await alertAdmins('alerta');
    expect(errSpy).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
