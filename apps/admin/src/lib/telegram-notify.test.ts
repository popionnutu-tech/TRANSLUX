import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('./supabase', () => ({
  getSupabase: () => ({ from: fromMock }),
}));

import { sendTelegram, sendTelegramPhoto, alertAdmins, escapeHtml } from './telegram-notify';

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

  it('sendTelegramPhoto: multipart la sendPhoto, întoarce message_id', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 777 } }) });
    const res = await sendTelegramPhoto(-100123, Buffer.from('png'), '<b>cap</b>', 'grafic.png');
    expect(res).toEqual({ ok: true, messageId: 777 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botTEST_TOKEN/sendPhoto');
    const form = init.body as FormData;
    expect(form.get('chat_id')).toBe('-100123');
    expect(form.get('caption')).toBe('<b>cap</b>');
    expect(form.get('parse_mode')).toBe('HTML');
    expect((form.get('photo') as File).name).toBe('grafic.png');
  });

  it('sendTelegramPhoto: răspuns non-2xx → ok=false, fără excepție', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'chat not found' });
    await expect(sendTelegramPhoto(1, Buffer.from('x'), 'c')).resolves.toEqual({ ok: false, messageId: null });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('sendTelegramPhoto: fără token nu apelează Telegram', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    await expect(sendTelegramPhoto(1, Buffer.from('x'), 'c')).resolves.toEqual({ ok: false, messageId: null });
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

  it('escapeHtml екранира <, >, и &', () => {
    expect(escapeHtml('<b>&')).toBe('&lt;b&gt;&amp;');
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('A & B')).toBe('A &amp; B');
    expect(escapeHtml('normal text')).toBe('normal text');
  });
});
