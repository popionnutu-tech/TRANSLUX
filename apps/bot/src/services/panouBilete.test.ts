import { describe, expect, it } from 'vitest';
import {
  citesteBilete, citesteOferta, citesteStare, creeazaPanouBilete, TIMEOUT_CONFIRMA_MS,
} from './panouBilete.js';

const OFERTA = {
  ok: true, tip: 'oferta', oferta_id: '11111111-2222-3333-4444-555555555555', suma: 120, total: 270, noimi: 8,
  expira_la: '2026-10-14T02:00:00Z', departure_at: '2026-10-14T05:45:00+03:00', from_name: 'Briceni', to_name: 'Chișinău', lang: 'ru',
};

describe('citesteOferta (forma contractului)', () => {
  it('oferta completă → tip oferta cu limba', () => {
    expect(citesteOferta(OFERTA)).toMatchObject({ tip: 'oferta', suma: 120, lang: 'ru' });
  });
  it('ofertă fără sumă sau cu sumă 0 → null', () => {
    expect(citesteOferta({ ...OFERTA, suma: undefined })).toBeNull();
    expect(citesteOferta({ ...OFERTA, suma: 0 })).toBeNull();
  });
  it('ramurile cere_cifre / fara_bani / dispecer / cifre_gresite / refuz', () => {
    expect(citesteOferta({ ok: true, tip: 'cere_cifre' })).toEqual({ tip: 'cere_cifre' });
    expect(citesteOferta({ ok: true, tip: 'fara_bani', motiv: 'sub_4h' })).toEqual({ tip: 'fara_bani', motiv: 'sub_4h' });
    expect(citesteOferta({ ok: true, tip: 'dispecer', motiv: 'blocat' })).toEqual({ tip: 'dispecer', motiv: 'blocat' });
    expect(citesteOferta({ ok: false, cod: 'cifre_gresite', ramase: 3 })).toEqual({ tip: 'cifre_gresite', ramase: 3 });
    expect(citesteOferta({ ok: false, cod: 'nelegat' })).toEqual({ tip: 'refuz', cod: 'nelegat' });
  });
  it('motive și coduri necunoscute → null (nu se ghicește)', () => {
    expect(citesteOferta({ ok: true, tip: 'fara_bani', motiv: 'ploua' })).toBeNull();
    expect(citesteOferta({ ok: false, cod: 'unauthorized' })).toBeNull();
    expect(citesteOferta({ ok: true, tip: 'altceva' })).toBeNull();
    expect(citesteOferta('text')).toBeNull();
  });
});

describe('citesteStare / citesteBilete', () => {
  it('starea din listă, suma opțională, motivul păstrat', () => {
    expect(citesteStare({ ok: true, stare: 'refuz', suma: 90, motiv: 'inchis' })).toEqual({ stare: 'refuz', suma: 90, motiv: 'inchis' });
    expect(citesteStare({ ok: true, stare: 'creat' })).toEqual({ stare: 'creat', suma: null });
    expect(citesteStare({ ok: true, stare: 'gata' })).toBeNull();
  });
  it('lista biletelor: un rând stricat strică lista', () => {
    const b = { cod: 'a'.repeat(32), status: 'platita', lang: 'ro', from_name: 'A', to_name: 'B', departure_at: '2026-10-14T05:45:00Z', seats: 1, total: 135 };
    expect(citesteBilete({ ok: true, bilete: [b] })).toHaveLength(1);
    expect(citesteBilete({ ok: true, bilete: [b, { ...b, seats: 'x' }] })).toBeNull();
  });
});

type Cerere = { url: string; init: RequestInit };

function fetchFals(raspuns: () => Promise<Response>) {
  const cereri: Cerere[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    cereri.push({ url: String(url), init: init ?? {} });
    return raspuns();
  }) as typeof fetch;
  return { cereri, fetchImpl };
}

const json = (corp: unknown, status = 200) => new Response(JSON.stringify(corp), { status, headers: { 'Content-Type': 'application/json' } });

describe('creeazaPanouBilete (transportul)', () => {
  it('fără cheie → indisponibil, fără nicio cerere', async () => {
    const f = fetchFals(async () => json(OFERTA));
    const p = creeazaPanouBilete({ baseUrl: 'https://hub', apiKey: '', fetchImpl: f.fetchImpl });
    expect(await p.oferta(1, 'a'.repeat(32))).toEqual({ tip: 'eroare', eroare: 'indisponibil' });
    expect(f.cereri).toHaveLength(0);
  });

  it('cheia în Authorization, telegram_id și cifrele în corp', async () => {
    const f = fetchFals(async () => json(OFERTA));
    const p = creeazaPanouBilete({ baseUrl: 'https://hub', apiKey: 'K'.repeat(64), fetchImpl: f.fetchImpl });
    const r = await p.oferta(42, 'a'.repeat(32), '3456');
    expect(r.tip).toBe('raspuns');
    expect(f.cereri[0].url).toBe('https://hub/api/bilete/retur/oferta');
    expect((f.cereri[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${'K'.repeat(64)}`);
    expect(JSON.parse(String(f.cereri[0].init.body))).toEqual({ telegram_id: 42, cod: 'a'.repeat(32), cifre: '3456' });
  });

  it('răspunsul de domeniu cu 4xx (cifre greșite) se citește; 401 fără contract → http', async () => {
    const gresite = creeazaPanouBilete({ baseUrl: 'https://hub', apiKey: 'k', fetchImpl: fetchFals(async () => json({ ok: false, cod: 'cifre_gresite', ramase: 2 }, 400)).fetchImpl });
    expect(await gresite.oferta(1, 'a'.repeat(32), '0000')).toEqual({ tip: 'raspuns', raspuns: { tip: 'cifre_gresite', ramase: 2 } });
    const neautorizat = creeazaPanouBilete({ baseUrl: 'https://hub', apiKey: 'k', fetchImpl: fetchFals(async () => json({ error: 'unauthorized' }, 401)).fetchImpl });
    expect(await neautorizat.oferta(1, 'a'.repeat(32))).toEqual({ tip: 'eroare', eroare: 'http', status: 401 });
  });

  it('timeout → eroare timeout; confirma are 25 s', async () => {
    const f = fetchFals(async () => { throw Object.assign(new Error('expirat'), { name: 'TimeoutError' }); });
    const p = creeazaPanouBilete({ baseUrl: 'https://hub', apiKey: 'k', fetchImpl: f.fetchImpl });
    expect(await p.confirma(1, 'o')).toEqual({ tip: 'eroare', eroare: 'timeout' });
    expect(f.cereri[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(TIMEOUT_CONFIRMA_MS).toBe(25_000);
  });

  it('stare: GET cu oferta_id și telegram_id în query, fără corp', async () => {
    const f = fetchFals(async () => json({ ok: true, stare: 'in_curs', suma: 120 }));
    const p = creeazaPanouBilete({ baseUrl: 'https://hub', apiKey: 'k', fetchImpl: f.fetchImpl });
    expect(await p.stare(7, 'abc')).toEqual({ tip: 'raspuns', raspuns: { stare: 'in_curs', suma: 120 } });
    expect(f.cereri[0].url).toBe('https://hub/api/bilete/retur/stare?oferta_id=abc&telegram_id=7');
    expect(f.cereri[0].init.method).toBe('GET');
    expect(f.cereri[0].init.body).toBeUndefined();
  });
});
