import { describe, expect, it } from 'vitest';
import { calculeazaDepartureAt, pretVandabilOnline, SUMA_MINIMA_PLATA_MDL, vanzareDeschisa } from '@translux/db';
import { maibCallbackSignature, verifyMaibCallback } from '@/lib/maib/signature';
import { noimiRestituire, sumaRestituire } from './refund-reguli';
import { cheieCursa, clasificaScanare } from './sofer-reguli';

// Testul de stres pe regulile pure (Ion, 06.10: «fă 10000 de ori test la tot sistemul»): 10.000 de cazuri generate cu
// un seed fix (reproductibil), pentru fiecare regulă de pe drumul căutare → plată → scanare → returnare.
// Invarianții, nu exemplele: ce trebuie să fie adevărat ORICARE ar fi intrarea.

const N = 10_000;

/** mulberry32 — PRNG mic, determinist. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = prng(20261006);
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const ziRandom = () => {
  const d = new Date(Date.UTC(2026, 0, 1) + int(0, 729) * 86_400_000);
  return d.toISOString().slice(0, 10);
};

describe(`stres ${N}: ora plecării de la oprire`, () => {
  it('în ziua cursei sau în ziua următoare, niciodată în trecutul zilei, cu offsetul Chișinăului', () => {
    for (let i = 0; i < N; i++) {
      const zi = ziRandom();
      const pornire = int(0, 1439);
      const oprire = int(0, 1439);
      const iso = calculeazaDepartureAt(zi, hhmm(oprire), hhmm(pornire));
      const t = Date.parse(iso);
      expect(Number.isFinite(t)).toBe(true);
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+0[23]:00$/);
      const ziua = iso.slice(0, 10);
      if (oprire >= pornire) expect(ziua).toBe(zi);
      else expect(ziua > zi).toBe(true);
      // Ora scrisă e ora cerută; singura excepție e golul de primăvară (03:00–03:59 nu există), mutat cu o oră (N6).
      const peGol = iso.slice(5, 10) === '03-28' || iso.slice(5, 10) === '03-29' ? iso.slice(11, 13) === '04' && hhmm(oprire).startsWith('03') : false;
      expect(iso.slice(11, 16)).toBe(peGol ? `04${hhmm(oprire).slice(2)}` : hhmm(oprire));
      // Instantul se întoarce în ora locală scrisă (offset-ul e al orei, nu al zilei).
      expect(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t)).toBe(iso.slice(11, 16));
    }
  });
});

describe(`stres ${N}: fereastra de vânzare`, () => {
  it('tur se închide la pornirea rutei − marjă; retur la plecarea pasagerului − marjă; exact pe prag e închis', () => {
    for (let i = 0; i < N; i++) {
      const plecare = Date.UTC(2026, 9, 20, 3) + int(0, 20 * 60) * 60_000;
      const pornire = plecare - int(0, 300) * 60_000;
      const marjaTur = int(0, 60);
      const marjaRetur = int(0, 240);
      const goingNorth = rnd() < 0.5;
      const prag = goingNorth ? plecare - marjaRetur * 60_000 : pornire - marjaTur * 60_000;
      const acum = prag + int(-600, 600) * 60_000;
      const deschis = vanzareDeschisa({
        goingNorth, departureAt: new Date(plecare).toISOString(), pornireRutaAt: new Date(pornire).toISOString(),
        nowMs: acum, inchidereTurMin: marjaTur, inchidereReturMin: marjaRetur,
      });
      expect(deschis).toBe(acum < prag);
    }
  });
});

describe(`stres ${N}: grila de returnare (24/12/6/4 h, noimi)`, () => {
  it('suma între 0 și plată, nu crește cu cât e mai târziu, vina noastră = tot', () => {
    for (let i = 0; i < N; i++) {
      const total = int(10, 2000) + int(0, 99) / 100;
      const plecare = Date.UTC(2026, 9, 20, 6);
      const a = plecare - int(-120, 72 * 60) * 60_000;
      const b = a + int(0, 72 * 60) * 60_000; // b e mai târziu decât a
      const na = noimiRestituire(new Date(plecare).toISOString(), a);
      const nb = noimiRestituire(new Date(plecare).toISOString(), b);
      expect([0, 6, 7, 8, 9]).toContain(na);
      expect(nb).toBeLessThanOrEqual(na);
      const sa = sumaRestituire(total, na);
      expect(sa).toBeGreaterThanOrEqual(0);
      expect(sa).toBeLessThanOrEqual(total);
      expect(Math.abs(sa * 100 - Math.round(sa * 100))).toBeLessThan(1e-6); // bani întregi
      expect(sumaRestituire(total, nb)).toBeLessThanOrEqual(sa);
      expect(noimiRestituire(new Date(plecare).toISOString(), b, true)).toBe(9);
      if ((plecare - a) / 3_600_000 < 4) expect(na).toBe(0);
    }
  });
});

describe(`stres ${N}: minimul de 10 MDL`, () => {
  it('se vinde online exact de la 10 lei în sus', () => {
    for (let i = 0; i < N; i++) {
      const p = int(0, 3000) / 100;
      expect(pretVandabilOnline(p)).toBe(p >= SUMA_MINIMA_PLATA_MDL);
    }
  });
});

describe(`stres ${N}: semnătura callback-ului maib`, () => {
  it('corpul semnat trece; orice octet schimbat, altă cheie sau ceas defazat peste 5 min nu trec', () => {
    const cheie = 'cheie-de-proba-stres';
    for (let i = 0; i < N; i++) {
      const corp = JSON.stringify({ result: { payId: `p${i}`, status: 'Executed', amount: int(10, 999) }, n: rnd() });
      const acum = Date.UTC(2026, 9, 6, 20) + int(0, 1e6) * 1000;
      const ts = String(acum);
      const sig = `sha256=${maibCallbackSignature(corp, ts, cheie)}`;
      expect(verifyMaibCallback(corp, sig, ts, cheie, acum).ok).toBe(true);
      const poz = int(0, corp.length - 1);
      const schimbat = corp.slice(0, poz) + (corp[poz] === 'x' ? 'y' : 'x') + corp.slice(poz + 1);
      expect(verifyMaibCallback(schimbat, sig, ts, cheie, acum).ok).toBe(false);
      expect(verifyMaibCallback(corp, sig, ts, `${cheie}2`, acum).ok).toBe(false);
      expect(verifyMaibCallback(corp, sig, ts, cheie, acum + 6 * 60_000).ok).toBe(false);
    }
  });
});

describe(`stres ${N}: clasificarea scanării la urcare`, () => {
  it('ok doar pe biletul valid al cursei șoferului; urcat de altul = deja_urcat; anulat/returnat = anulat', () => {
    const statusuri = ['valid', 'urcat', 'anulat', 'returnat'] as const;
    for (let i = 0; i < N; i++) {
      const cheieSofer = cheieCursa('2026-10-20', int(1, 40), rnd() < 0.5);
      const cheieBilet = rnd() < 0.7 ? cheieSofer : cheieCursa('2026-10-20', int(1, 40), rnd() < 0.5);
      const status = statusuri[int(0, 3)];
      const sofer = `s${int(1, 3)}`;
      const urcatDe = status === 'urcat' ? `s${int(1, 3)}` : null;
      const dejaScrisa = rnd() < 0.3;
      const bilet = rnd() < 0.05 ? null : { status, cheie: cheieBilet, urcat_de: urcatDe };
      const r = clasificaScanare(bilet, cheieSofer, sofer, dejaScrisa);
      if (!bilet) { expect(r.rezultat).toBe('necunoscut'); continue; }
      if (status === 'anulat' || status === 'returnat') { expect(r.rezultat).toBe('anulat'); continue; }
      if (cheieBilet !== cheieSofer) { expect(r.rezultat).toBe('alta_cursa'); continue; }
      if (status === 'valid') { expect(r.rezultat).toBe('ok'); continue; }
      // urcat
      if (urcatDe === sofer && dejaScrisa) expect(r.rezultat).toBe('ok');
      else expect(r.rezultat).toBe('deja_urcat');
    }
  });
});
