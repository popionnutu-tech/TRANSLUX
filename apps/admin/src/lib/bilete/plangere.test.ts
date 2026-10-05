import { describe, expect, it, vi } from 'vitest';
import {
  conversatieTelegram, inregistreazaPlangerea, PLAFON_PLANGERI_ZI, valideazaCererePlangere,
  type ComandaPlangere, type CererePlangere, type DepsPlangere, type RandPlangere,
} from './plangere';

// ION-252 / ION-247: plângerea din botul Telegram, pe panou — validarea, plafonul 3/zi/cont, legarea doar de comanda
// contului, rândul din voice_complaints și mesajul în grupă (după răspuns, o singură dată).

const EU = 8681673761;
const ALTUL = 555000111;
const COD = 'ab'.repeat(16);
const ZI = '2026-10-05T00:00:00+03:00';

const comanda = (o: Partial<ComandaPlangere> = {}): ComandaPlangere => ({
  id: '11111111-2222-3333-4444-555555555555', telegram_id: EU, trip_date: '2026-10-05', crm_route_id: 3, going_north: true,
  from_name: 'Chișinău', to_name: 'Briceni', departure_at: '2026-10-05T14:00:00+03:00', passenger_name: 'Pop Ion', phone: '37368263753', ...o,
});

const cerere = (o: Partial<CererePlangere> = {}): CererePlangere => ({ telegramId: EU, mesajId: 77, text: 'Șoferul a fumat în salon', cod: COD, fotoFileId: null, ...o });

function deps(o: { plangeriAzi?: number; comanda?: ComandaPlangere | null; dubla?: boolean; grupaOk?: boolean } = {}) {
  const scrise: RandPlangere[] = [];
  const d = {
    repo: {
      plangeriDeLa: vi.fn(async () => o.plangeriAzi ?? 0),
      comanda: vi.fn(async () => (o.comanda === undefined ? comanda() : o.comanda)),
      soferulCursei: vi.fn(async () => ({ driver_id: 'd1', driver_name: 'Vasile Rusu', plate: 'TLX 123' })),
      insereaza: vi.fn(async (r: RandPlangere) => { scrise.push(r); return o.dubla ? 'dubla' as const : 'inserata' as const; }),
    },
    inceputulZilei: ZI,
    oraChisinau: () => '14:00',
    normalizeazaTelefon: (t: string) => `+${t}`,
    tipImplicit: 'ALTUL',
    eticheta: vi.fn(async () => ({ name_ru: 'Другое', culprit: 'NECLAR' as const })),
    trimiteInGrupa: vi.fn(async () => o.grupaOk ?? true),
    marcheazaGrupa: vi.fn(async () => {}),
    formateaza: vi.fn((c: Parameters<DepsPlangere['formateaza']>[0]) => `GRUPA:${c.driver_name}:${c.evidence}:${c.sursa}:${c.complaint}`),
  } satisfies DepsPlangere;
  return { d, scrise };
}

describe('valideazaCererePlangere', () => {
  it('corpul bun → cererea, cu textul curățat și tăiat la 2000', () => {
    const v = valideazaCererePlangere({ telegram_id: EU, mesaj_id: 5, text: `  a fumat\u0007 ${'x'.repeat(3000)}`, cod: COD.toUpperCase(), foto_file_id: 'AgACAgIAAxkBAAIB' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.cerere.text.startsWith('a fumat  x')).toBe(true);
    expect(v.cerere.text).toHaveLength(2000);
    expect(v.cerere.cod).toBe(COD);
    expect(v.cerere.fotoFileId).toBe('AgACAgIAAxkBAAIB');
  });
  it('telegram_id / mesaj_id / text lipsă sau stricate → motivul', () => {
    expect(valideazaCererePlangere({ mesaj_id: 1, text: 'x' })).toEqual({ ok: false, eroare: 'telegram_id' });
    expect(valideazaCererePlangere({ telegram_id: -4, mesaj_id: 1, text: 'x' })).toEqual({ ok: false, eroare: 'telegram_id' });
    expect(valideazaCererePlangere({ telegram_id: EU, text: 'x' })).toEqual({ ok: false, eroare: 'mesaj_id' });
    expect(valideazaCererePlangere({ telegram_id: EU, mesaj_id: 1, text: '   ' })).toEqual({ ok: false, eroare: 'text' });
    expect(valideazaCererePlangere(null)).toEqual({ ok: false, eroare: 'telegram_id' });
  });
  it('cod sau poză cu formă greșită → ignorate, nu refuz', () => {
    const v = valideazaCererePlangere({ telegram_id: EU, mesaj_id: 1, text: 'x', cod: 'nu-e-cod', foto_file_id: 'a b<script>' });
    expect(v.ok && v.cerere.cod).toBeNull();
    expect(v.ok && v.cerere.fotoFileId).toBeNull();
  });
});

describe('inregistreazaPlangerea', () => {
  it('plângere cu biletul contului → rând «telegram» legat de comandă, cursă și șofer; grupa după răspuns', async () => {
    const { d, scrise } = deps();
    const r = await inregistreazaPlangerea(cerere({ fotoFileId: 'F1' }), d);
    expect(r.status).toBe(200);
    expect(d.repo.plangeriDeLa).toHaveBeenCalledWith(EU, ZI);
    expect(scrise[0]).toEqual({
      conversation_id: `tg_${EU}_77`, telegram_id: EU, bilet_comanda_id: '11111111-2222-3333-4444-555555555555', foto_file_id: 'F1',
      caller_phone: '+37368263753', caller_name: 'Pop Ion', complaint: 'Șoferul a fumat în salon', trip_date: '2026-10-05',
      departure: '14:00', route: 'Chișinău – Briceni', driver_id: 'd1', driver_name: 'Vasile Rusu', plate: 'TLX 123',
      identified: true, evidence: 'bilet', complaint_type: 'ALTUL', alerted: true,
    });
    // nimic în grupă înainte de răspuns
    expect(d.trimiteInGrupa).not.toHaveBeenCalled();
    await r.notifica?.();
    expect(d.trimiteInGrupa).toHaveBeenCalledWith('GRUPA:Vasile Rusu:bilet:telegram:Șoferul a fumat în salon', 'F1');
    expect(d.marcheazaGrupa).toHaveBeenCalledWith(`tg_${EU}_77`);
  });

  it(`plafonul: a ${PLAFON_PLANGERI_ZI + 1}-a plângere din zi → 429, nimic scris, nimic în grupă`, async () => {
    const { d, scrise } = deps({ plangeriAzi: PLAFON_PLANGERI_ZI });
    const r = await inregistreazaPlangerea(cerere(), d);
    expect(r).toEqual({ status: 429, corp: { ok: false, cod: 'plafon' }, notifica: null });
    expect(scrise).toHaveLength(0);
    expect(d.repo.comanda).not.toHaveBeenCalled();
  });

  it('sub plafon (a 3-a) → trece', async () => {
    const { d } = deps({ plangeriAzi: PLAFON_PLANGERI_ZI - 1 });
    expect((await inregistreazaPlangerea(cerere(), d)).status).toBe(200);
  });

  it('comanda e a ALTUI cont → plângerea se scrie fără comandă, fără cursă, fără șofer și fără datele celuilalt', async () => {
    const { d, scrise } = deps({ comanda: comanda({ telegram_id: ALTUL }) });
    const r = await inregistreazaPlangerea(cerere(), d);
    expect(r.status).toBe(200);
    expect(d.repo.soferulCursei).not.toHaveBeenCalled();
    expect(scrise[0]).toMatchObject({
      telegram_id: EU, bilet_comanda_id: null, caller_phone: null, caller_name: null, trip_date: null, route: null,
      driver_id: null, identified: false,
    });
  });

  it('fără cod sau comanda inexistentă → plângerea neidentificată, tot în grupă', async () => {
    for (const c of [cerere({ cod: null }), cerere()]) {
      const { d, scrise } = deps({ comanda: null });
      const r = await inregistreazaPlangerea(c, d);
      expect(scrise[0]).toMatchObject({ bilet_comanda_id: null, identified: false });
      await r.notifica?.();
      expect(d.trimiteInGrupa).toHaveBeenCalledOnce();
    }
  });

  it('graficul nu are șofer pe cursă → rând legat de comandă, dar neidentificat', async () => {
    const { d, scrise } = deps();
    d.repo.soferulCursei.mockResolvedValueOnce(null as never);
    await inregistreazaPlangerea(cerere(), d);
    expect(scrise[0]).toMatchObject({ bilet_comanda_id: '11111111-2222-3333-4444-555555555555', identified: false, driver_id: null });
  });

  it('același mesaj reluat (dublă pe conversation_id) → ok, fără al doilea mesaj în grupă', async () => {
    const { d } = deps({ dubla: true });
    const r = await inregistreazaPlangerea(cerere(), d);
    expect(r).toEqual({ status: 200, corp: { ok: true }, notifica: null });
  });

  it('grupa nelegată / trimiterea a căzut → rândul rămâne, marcajul «grupa a văzut» NU se scrie', async () => {
    const { d } = deps({ grupaOk: false });
    const r = await inregistreazaPlangerea(cerere(), d);
    await r.notifica?.();
    expect(d.marcheazaGrupa).not.toHaveBeenCalled();
  });

  it('conversatieTelegram: un mesaj = o plângere', () => {
    expect(conversatieTelegram(EU, 9)).toBe(`tg_${EU}_9`);
  });
});
