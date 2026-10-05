import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const { codDinPayload, mesajBilet } = await import('./bilet.js');

describe('codDinPayload', () => {
  it('bilet_ + 32 hex → codul în litere mici', () => {
    expect(codDinPayload('bilet_0123456789ABCDEF0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
  });
  it('invitațiile personalului și formele greșite → null (merg pe ramura veche)', () => {
    expect(codDinPayload('abc123invite')).toBeNull();
    expect(codDinPayload('bilet_123')).toBeNull();
    expect(codDinPayload('bilet_0123456789abcdef0123456789abcdefXX')).toBeNull();
    expect(codDinPayload('xbilet_0123456789abcdef0123456789abcdef')).toBeNull();
    expect(codDinPayload(undefined)).toBeNull();
    expect(codDinPayload('')).toBeNull();
  });
});

describe('mesajBilet', () => {
  const c = { cod: 'ab'.repeat(16), status: 'platita', lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-14T05:45:00+03:00', seats: 2 };
  it('RO: cursa, ora Chișinăului, locurile, starea și linkul paginii RO', () => {
    const m = mesajBilet(c);
    expect(m.text).toContain('Briceni → Chișinău');
    expect(m.text).toContain('05:45');
    expect(m.text).toContain('locuri: 2');
    expect(m.text).toContain('Plătit');
    expect(m.url).toBe(`https://translux.md/ro/bilet/${c.cod}`);
  });
  it('RU: textul și pagina RU; stare necunoscută rămâne cum e', () => {
    const m = mesajBilet({ ...c, lang: 'ru', status: 'ceva_nou' });
    expect(m.text).toContain('мест: 2');
    expect(m.text).toContain('ceva_nou');
    expect(m.url).toBe(`https://translux.md/ru/bilet/${c.cod}`);
  });
});

describe('legarea și butonul «Returnează» (ION-244)', () => {
  const ME = 555;
  const COD = 'ab'.repeat(16);
  const comanda = (telegram_id: number | null, status = 'platita') => ({
    cod: COD, status, lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-14T05:45:00+03:00', seats: 1,
    telegram_id, trip_date: '2026-10-14', crm_route_id: 1655, going_north: false,
  });

  async function porneste(telegramDinBaza: number | null, legatDupaUpdate: number | null, status = 'platita') {
    const { handleBiletStart } = await import('./bilet.js');
    const replies: Array<{ text: string; butoane: string[] }> = [];
    const repo = {
      comandaDupaCod: vi.fn(async () => comanda(telegramDinBaza, status)),
      leagaComanda: vi.fn(async () => legatDupaUpdate),
      comenziLegate: vi.fn(async () => []),
      telefonSofer: vi.fn(async () => null),
    };
    const ctx = {
      chat: { type: 'private' }, from: { id: ME },
      reply: vi.fn(async (text: string, extra?: { reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> } }) => {
        replies.push({ text, butoane: (extra?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? b.url ?? '') });
      }),
    };
    await handleBiletStart(ctx as never, COD, repo);
    return { replies, repo };
  }

  it('comanda nelegată → se leagă de contul care a deschis-o, cu butonul de returnare', async () => {
    const { replies, repo } = await porneste(null, ME);
    expect(repo.leagaComanda).toHaveBeenCalledWith(COD, ME);
    expect(replies[0].butoane).toEqual([`https://translux.md/ro/bilet/${COD}`, `retur:cere:${COD}`]);
  });
  it('legată de ALT cont → biletul se arată, fără returnare, fără a o relega', async () => {
    const { replies, repo } = await porneste(999, 999);
    expect(repo.leagaComanda).not.toHaveBeenCalled();
    expect(replies[0].butoane).toEqual([`https://translux.md/ro/bilet/${COD}`]);
    expect(replies[0].text).toMatch(/legat de alt cont Telegram/);
  });
  it('cursa: altcineva a legat-o între citire și UPDATE → tot fără returnare', async () => {
    const { replies } = await porneste(null, 999);
    expect(replies[0].butoane).not.toContain(`retur:cere:${COD}`);
  });
  it('comanda proprie dar neplătită → fără returnare', async () => {
    const { replies } = await porneste(ME, ME, 'anulata');
    expect(replies[0].butoane).toEqual([`https://translux.md/ro/bilet/${COD}`]);
  });
});
