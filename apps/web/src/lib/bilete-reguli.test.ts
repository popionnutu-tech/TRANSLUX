import { describe, expect, it } from 'vitest';
import { CONFIG_INCHIS, emailOptional, linkHarta, mesajEroareComanda, normalizeazaTelefon, numeComplet, parseazaConfig, parseazaPuncte, puncteCursei, urlPlataSigur, vanzareDeschisaPeSite } from './bilete-reguli';

const cfg = { activ: true, inchidere_tur_min: 0, inchidere_retur_min: 120, rute: [{ id: 2, tur: true, retur: false }, { id: 8, tur: true, retur: true }] };
// Marți 14.10.2026, 05:00 la Chișinău (ora de vară, +03:00).
const now = Date.parse('2026-10-14T05:00:00+03:00');

describe('vanzareDeschisaPeSite', () => {
  const baza = { cfg, routeId: 2, goingNorth: false, tripDate: '2026-10-14', time: '07:10', pornireRuta: '06:30', soferPeZi: true, nowMs: now };
  it('tur deschis pe ruta 2, înainte de pornirea rutei → da', () => {
    expect(vanzareDeschisaPeSite(baza)).toBe(true);
  });
  it('retur închis pe ruta 2 → nu; deschis pe ruta 8 → da', () => {
    expect(vanzareDeschisaPeSite({ ...baza, goingNorth: true })).toBe(false);
    expect(vanzareDeschisaPeSite({ ...baza, routeId: 8, goingNorth: true, time: '16:00', pornireRuta: '16:00' })).toBe(true);
  });
  it('steag global închis / fără șofer pe zi / rută necunoscută → nu', () => {
    expect(vanzareDeschisaPeSite({ ...baza, cfg: { ...cfg, activ: false } })).toBe(false);
    expect(vanzareDeschisaPeSite({ ...baza, soferPeZi: false })).toBe(false);
    expect(vanzareDeschisaPeSite({ ...baza, routeId: 99 })).toBe(false);
    expect(vanzareDeschisaPeSite({ ...baza, cfg: CONFIG_INCHIS })).toBe(false);
  });
  it('tur: după pornirea rutei din capăt → nu, chiar dacă oprirea omului e mai târziu', () => {
    const dupa = Date.parse('2026-10-14T06:31:00+03:00');
    expect(vanzareDeschisaPeSite({ ...baza, nowMs: dupa })).toBe(false);
  });
  it('retur: închis cu 120 min înainte de plecarea de la oprirea omului', () => {
    const r = { ...baza, routeId: 8, goingNorth: true, time: '16:00', pornireRuta: '16:00' };
    expect(vanzareDeschisaPeSite({ ...r, nowMs: Date.parse('2026-10-14T13:59:00+03:00') })).toBe(true);
    expect(vanzareDeschisaPeSite({ ...r, nowMs: Date.parse('2026-10-14T14:01:00+03:00') })).toBe(false);
  });
  it('oprire după miezul nopții (00:05 pe ruta pornită la 22:30) e în ziua următoare → tur deschis seara', () => {
    expect(vanzareDeschisaPeSite({ ...baza, routeId: 8, time: '00:05', pornireRuta: '22:30', nowMs: Date.parse('2026-10-14T21:00:00+03:00') })).toBe(true);
  });
  it('ora invalidă → nu', () => {
    expect(vanzareDeschisaPeSite({ ...baza, time: '7:10' })).toBe(false);
  });
});

describe('parseazaConfig', () => {
  it('răspuns valid → config; rute fără id valid cad', () => {
    const c = parseazaConfig({ ok: true, activ: true, inchidere_tur_min: 15, inchidere_retur_min: 90, rute: [{ id: 2, tur: true, retur: 'da' }, { id: 'x', tur: true, retur: true }] });
    expect(c).toEqual({ activ: true, inchidere_tur_min: 15, inchidere_retur_min: 90, rute: [{ id: 2, tur: true, retur: false }] });
  });
  it('null / text / activ ca string → închis', () => {
    expect(parseazaConfig(null)).toEqual(CONFIG_INCHIS);
    expect(parseazaConfig('x')).toEqual(CONFIG_INCHIS);
    expect(parseazaConfig({ activ: 'true' }).activ).toBe(false);
  });
});

describe('normalizeazaTelefon', () => {
  it('formele moldovenești → 373 + 8 cifre; altceva → null', () => {
    expect(normalizeazaTelefon('069 123 456')).toBe('37369123456');
    expect(normalizeazaTelefon('+373 69 123 456')).toBe('37369123456');
    expect(normalizeazaTelefon('69123456')).toBe('37369123456');
    expect(normalizeazaTelefon('0691234')).toBeNull();
    expect(normalizeazaTelefon('+40 721 000 000')).toBeNull();
  });
});

describe('mesajEroareComanda', () => {
  it('codul API-ului bate statusul; fără cod → după status; RO primește textul la validare', () => {
    expect(mesajEroareComanda('inchis', 400, 'ro')).toMatch(/s-a închis/);
    expect(mesajEroareComanda(undefined, 429, 'ru')).toMatch(/попыток/);
    expect(mesajEroareComanda(undefined, 503, 'ro')).toMatch(/Banca/);
    expect(mesajEroareComanda('validare', 400, 'ro', 'telefonul nu e valid')).toBe('telefonul nu e valid');
    expect(mesajEroareComanda('validare', 400, 'ru', 'telefonul nu e valid')).toMatch(/Проверьте/);
  });
});

describe('urlPlataSigur', () => {
  it('pagina de plată maib (sandbox și prod) → da; alt domeniu, http, sufix fals → nu', () => {
    expect(urlPlataSigur('https://checkout-sandbox.maib.md/abc')).toBe(true);
    expect(urlPlataSigur('https://checkout.maib.md/abc')).toBe(true);
    expect(urlPlataSigur('https://sandbox.maibmerchants.md/x')).toBe(true);
    expect(urlPlataSigur('http://checkout.maib.md/abc')).toBe(false);
    expect(urlPlataSigur('https://evilmaib.md/abc')).toBe(false);
    expect(urlPlataSigur('https://checkout.maib.md.evil.com/abc')).toBe(false);
    expect(urlPlataSigur('nu e url')).toBe(false);
  });
});

describe('numeComplet', () => {
  it('două câmpuri → «Nume Prenume», cu spațiile strânse', () => {
    expect(numeComplet('  Popescu ', 'Ion  Vasile')).toBe('Popescu Ion Vasile');
  });
  it('câmp gol, prea scurt sau prea lung → null', () => {
    expect(numeComplet('', 'Ion')).toBeNull();
    expect(numeComplet('Popescu', 'I')).toBeNull();
    expect(numeComplet('P'.repeat(41), 'Ion')).toBeNull();
  });
});

describe('emailOptional', () => {
  it('gol → null; valid → litere mici; greșit sau prea lung → invalid', () => {
    expect(emailOptional('   ')).toBeNull();
    expect(emailOptional(' Ion.Pop@Mail.MD ')).toBe('ion.pop@mail.md');
    expect(emailOptional('ion@mail')).toBe('invalid');
    expect(emailOptional('ion pop@mail.md')).toBe('invalid');
    expect(emailOptional(`${'a'.repeat(115)}@x.md`)).toBe(`${'a'.repeat(115)}@x.md`); // 120 = limita, permis
    expect(emailOptional(`${'a'.repeat(116)}@x.md`)).toBe('invalid');
  });
});

describe('punctele de urcare (ION-198)', () => {
  const raspuns = { ok: true, puncte: [
    { id: 2, nume_ro: 'Strada Farmaciei', nume_ru: 'ул. Фармачией', lat: 48.354, lon: 27.1, rang: 2, perechi: [[14, false], [27, false]] },
    { id: 1, nume_ro: 'Autogara', nume_ru: 'Автовокзал', lat: 48.357, lon: 27.092, rang: 1, perechi: [[14, false], [14, true]] },
    { id: 'x', nume_ro: 'rău', perechi: [] },
  ] };

  it('parsează doar punctele bine formate; orice altceva = listă goală', () => {
    expect(parseazaPuncte(raspuns).map((p) => p.id)).toEqual([2, 1]);
    expect(parseazaPuncte({ ok: false, puncte: raspuns.puncte })).toEqual([]);
    expect(parseazaPuncte(null)).toEqual([]);
    expect(parseazaPuncte({ ok: true, puncte: 'nu' })).toEqual([]);
  });

  it('punctele unei curse: pe rută și sens, după rang, fără perechi', () => {
    const toate = parseazaPuncte(raspuns);
    expect(puncteCursei(toate, 14, false).map((p) => p.id)).toEqual([1, 2]);
    expect(puncteCursei(toate, 14, true).map((p) => p.id)).toEqual([1]);
    expect(puncteCursei(toate, 5, false)).toEqual([]);
    expect(Object.keys(puncteCursei(toate, 27, false)[0]).sort()).toEqual(['id', 'lat', 'lon', 'nume_ro', 'nume_ru', 'rang']);
  });

  it('linkul spre hartă', () => {
    expect(linkHarta({ lat: 48.354, lon: 27.1 })).toBe('https://www.google.com/maps/search/?api=1&query=48.354,27.1');
  });
});
