import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  baniiAuAjuns, clasificaUrma, deciziaVerificare, decizieRefundStrain, deltaRefund, dupaRefundStrain, INCERCARI_MAX,
  LINISTE_DUPA_TRIMITERE_MS, miscareBanca, pasul, pauzaDupaRefuz, poateTrimite, refuzClarMaib, STARI_INCHISE, urmaBanca,
  type UrmaBanca,
} from './refund-intentii-reguli';

// Intenția de refund (558; dezbaterea Claude ⇄ Codex 10.10.2026, N2 + C3 + Codex C1): mașina de stări și împăcarea cu banca.

describe('pasul după starea revendicată', () => {
  it('revendicata → trimite; trimisa_necunoscut → împacă (niciodată retrimitere directă); creata → verifică', () => {
    expect(pasul('revendicata')).toBe('trimite');
    expect(pasul('trimisa_necunoscut')).toBe('impaca');
    expect(pasul('creata')).toBe('verifica');
    for (const s of ['de_trimis', 'finalizata', 'refuzata', 'anulata', 'finalizata_de_altul'] as const) expect(pasul(s)).toBe('nimic');
    // H2: «blocata» (revendicată doar cu refund_id) — doar citire, niciodată «trimite»
    expect(pasul('blocata')).toBe('verifica');
    expect([...STARI_INCHISE].sort()).toEqual(['anulata', 'finalizata', 'finalizata_de_altul']);
  });
});

describe('pauza după refuz: reîncercat automat, apoi blocat (nu «gata»)', () => {
  it('15 min, 1 h, 6 h, 24 h, apoi null (blocată) la INCERCARI_MAX', () => {
    expect(pauzaDupaRefuz(1)).toBe(15 * 60_000);
    expect(pauzaDupaRefuz(2)).toBe(60 * 60_000);
    expect(pauzaDupaRefuz(3)).toBe(6 * 60 * 60_000);
    expect(pauzaDupaRefuz(4)).toBe(24 * 60 * 60_000);
    expect(INCERCARI_MAX).toBe(5);
    expect(pauzaDupaRefuz(5)).toBeNull();
    expect(pauzaDupaRefuz(9)).toBeNull();
    expect(pauzaDupaRefuz(0)).toBeNull();
  });
});

const baza: UrmaBanca = { returnat: 0, cerut: 0, returnabil: 270 };

describe('împăcarea după un POST necunoscut (Codex C1: refundedAmount=0 nu e singura dovadă)', () => {
  it('nicio mișcare în niciun câmp → lipsește (se poate retrimite)', () => {
    expect(clasificaUrma(baza, { returnat: 0, cerut: 0, returnabil: 270 }, 150)).toBe('lipseste');
  });
  it('cererea în curs (requested ↑, returnat încă 0) → există: NU se retrimite', () => {
    expect(clasificaUrma(baza, { returnat: 0, cerut: 150, returnabil: 270 }, 150)).toBe('exista');
  });
  it('doar returnabilul a scăzut → există', () => {
    expect(clasificaUrma(baza, { returnat: 0, cerut: 0, returnabil: 120 }, 150)).toBe('exista');
  });
  it('acceptat → există', () => {
    expect(clasificaUrma(baza, { returnat: 150, cerut: 0, returnabil: 120 }, 150)).toBe('exista');
  });
  it('mișcare parțială → neclar (nimic automat)', () => {
    expect(clasificaUrma(baza, { returnat: 0, cerut: 40, returnabil: 270 }, 150)).toBe('neclar');
  });
  it('al doilea refund pe plata pachetului: baza include primul refund (120), nu zero', () => {
    const b2: UrmaBanca = { returnat: 120, cerut: 120, returnabil: 150 };
    expect(clasificaUrma(b2, { returnat: 120, cerut: 120, returnabil: 150 }, 150)).toBe('lipseste');
    // «cerut» cumulat (o lectură a documentației) sau doar în curs (cealaltă): ambele dau «există»
    expect(clasificaUrma(b2, { returnat: 120, cerut: 270, returnabil: 0 }, 150)).toBe('exista');
    expect(clasificaUrma({ returnat: 120, cerut: 0, returnabil: 150 }, { returnat: 120, cerut: 150, returnabil: 150 }, 150)).toBe('exista');
    expect(deltaRefund(b2, { returnat: 270, cerut: 270, returnabil: 0 })).toBe(150);
  });
  it('fără returnabil la bancă: se judecă pe celelalte două', () => {
    expect(clasificaUrma({ returnat: 0, cerut: 0, returnabil: null }, { returnat: 0, cerut: 0, returnabil: null }, 10)).toBe('lipseste');
    expect(clasificaUrma({ returnat: 0, cerut: 0, returnabil: null }, { returnat: 10, cerut: 0, returnabil: null }, 10)).toBe('exista');
  });
  it('banii au ajuns doar când returnatul a crescut cu toată suma', () => {
    expect(baniiAuAjuns(baza, { returnat: 0, cerut: 150, returnabil: 120 }, 150)).toBe(false);
    expect(baniiAuAjuns(baza, { returnat: 150, cerut: 0, returnabil: 120 }, 150)).toBe(true);
  });
  it('urmaBanca: lipsă → 0 / null', () => {
    expect(urmaBanca({ status: 'Executed', amount: 10 })).toEqual({ returnat: 0, cerut: 0, returnabil: null });
  });
});

describe('poateTrimite: verificările dinaintea POST-ului', () => {
  const p = { status: 'Executed', amount: 270, refundedAmount: 0, refundableAmount: 270, isRefundable: true, partialRefundAvailable: true };
  it('plata executată, suma în returnabil → da', () => {
    expect(poateTrimite(p, 270)).toEqual({ ok: true });
    expect(poateTrimite(p, 120)).toEqual({ ok: true });
  });
  it('al doilea refund: plata «PartiallyRefunded» se acceptă (D6 se încearcă la bancă)', () => {
    expect(poateTrimite({ ...p, status: 'PartiallyRefunded', refundedAmount: 120, refundableAmount: 150 }, 150)).toEqual({ ok: true });
  });
  it('peste returnabil, plata nereturnabilă, plata eșuată / returnată integral → refuz local', () => {
    expect(poateTrimite({ ...p, refundableAmount: 100 }, 150).ok).toBe(false);
    expect(poateTrimite({ ...p, isRefundable: false }, 10).ok).toBe(false);
    expect(poateTrimite({ ...p, status: 'Refunded' }, 10).ok).toBe(false);
    expect(poateTrimite({ ...p, status: 'Failed' }, 10).ok).toBe(false);
    expect(poateTrimite(p, 0).ok).toBe(false);
  });
  it('fără refund parțial: bucata din rest e refuzată, restul întreg se încearcă', () => {
    const q = { ...p, status: 'PartiallyRefunded', refundedAmount: 120, refundableAmount: 150, partialRefundAvailable: false };
    expect(poateTrimite(q, 100).ok).toBe(false);
    expect(poateTrimite(q, 150)).toEqual({ ok: true });
  });
});

// Revizia 10.10 (H1, H2, L1).
describe('L1: ce e refuz clar al băncii la POST /refund', () => {
  it('4xx și ok:false (200) da; 429 și 408 nu (rezultat necunoscut, împăcare, comanda nu se reactivează); 5xx și 0 nu', () => {
    for (const c of [400, 401, 403, 404, 409, 422, 200]) expect(refuzClarMaib(c), String(c)).toBe(true);
    for (const c of [429, 408, 500, 502, 503, 0]) expect(refuzClarMaib(c), String(c)).toBe(false);
  });
});

describe('H1: refund străin pe plată înaintea POST-ului', () => {
  const urmaZero: UrmaBanca = { returnat: 0, cerut: 0, returnabil: 150 };
  const fara = { refundId: null, refundStatus: null, actualizatMs: 0 };
  const now = Date.parse('2026-10-11T10:00:00Z');
  const a = (p: Partial<Parameters<typeof decizieRefundStrain>[0]>) => decizieRefundStrain({
    marcaj: fara, noastre: new Set(), atinsa: false, cunoscut: 0, urma: urmaZero, sumaPlatii: 150, suma: 150, nowMs: now, ...p,
  });
  it('nicio urmă → trimite', () => expect(a({})).toEqual({ fel: 'trimite' }));
  it('fluxul vechi a trimis același refund (bani cerut = suma noastră, refund_id străin) → preluat, nu retrimis', () => {
    expect(a({ marcaj: { refundId: 'R-vechi', refundStatus: 'Created', actualizatMs: now }, urma: { returnat: 0, cerut: 150, returnabil: 0 } }))
      .toEqual({ fel: 'adopta', refundId: 'R-vechi' });
  });
  it('bancă: refundedAmount acoperă deja suma (Accepted la fluxul vechi) → preluat', () => {
    expect(a({ marcaj: { refundId: 'R', refundStatus: 'Accepted', actualizatMs: now }, urma: { returnat: 150, cerut: 0, returnabil: 0 } }).fel).toBe('adopta');
  });
  it('bani străini care nu se potrivesc → blocat (nimic automat)', () => {
    expect(a({ marcaj: { refundId: 'R', refundStatus: 'Created', actualizatMs: now }, urma: { returnat: 0, cerut: 100, returnabil: 50 } }).fel).toBe('blocheaza');
    expect(a({ urma: { returnat: 40, cerut: 0, returnabil: 110 } }).fel).toBe('blocheaza');
  });
  it('banii de pe plată sunt ai intențiilor noastre (cunoscut) → trimite al doilea refund (returul, apoi turul)', () => {
    expect(a({ marcaj: { refundId: 'R1', refundStatus: 'Accepted', actualizatMs: now }, noastre: new Set(['R1']), cunoscut: 120, sumaPlatii: 270,
      urma: { returnat: 120, cerut: 0, returnabil: 150 } })).toEqual({ fel: 'trimite' });
  });
  it('refund_id străin fără bani vizibili → se citește refund-ul străin', () => {
    expect(a({ marcaj: { refundId: 'R', refundStatus: 'Created', actualizatMs: now } })).toEqual({ fel: 'verifica_strain', refundId: 'R' });
  });
  it('marcaj vechi «Pending» fără id: se așteaptă liniștea de 10 min, apoi (zero mișcare) se trimite', () => {
    const r = a({ marcaj: { refundId: null, refundStatus: 'Pending', actualizatMs: now - 60_000 } });
    expect(r).toEqual({ fel: 'asteapta', ms: LINISTE_DUPA_TRIMITERE_MS - 60_000 });
    expect(a({ marcaj: { refundId: null, refundStatus: 'Pending', actualizatMs: now - LINISTE_DUPA_TRIMITERE_MS - 1 } })).toEqual({ fel: 'trimite' });
  });
  it('«Necunoscut» e al nostru dacă intențiile au trimis deja (împăcarea l-a lămurit); străin altfel', () => {
    const m = { refundId: null, refundStatus: 'Necunoscut', actualizatMs: now };
    expect(a({ marcaj: m, atinsa: true })).toEqual({ fel: 'trimite' });
    expect(a({ marcaj: m, atinsa: false }).fel).toBe('asteapta');
  });
  it('refund-ul străin citit: Rejected → trimite; aceeași sumă → preluat; altă sumă → blocat', () => {
    expect(dupaRefundStrain({ status: 'Rejected', amount: 150 }, 150)).toBe('trimite');
    expect(dupaRefundStrain({ status: 'Created', amount: 150 }, 150)).toBe('adopta');
    expect(dupaRefundStrain({ status: 'Manual', amount: 150.004 }, 150)).toBe('adopta');
    expect(dupaRefundStrain({ status: 'Accepted', amount: 120 }, 150)).toBe('blocheaza');
    expect(dupaRefundStrain({ status: 'Created', amount: null }, 150)).toBe('blocheaza');
  });
  it('mișcarea totală la bancă: cea mai mare dintre returnat, cerut, suma − returnabil', () => {
    expect(miscareBanca({ returnat: 0, cerut: 0, returnabil: null }, 270)).toBe(0);
    expect(miscareBanca({ returnat: 0, cerut: 0, returnabil: 150 }, 270)).toBe(120);
    expect(miscareBanca({ returnat: 120, cerut: 150, returnabil: 150 }, 270)).toBe(150);
  });
});

describe('H2: refund-ul nostru citit — Manual blochează, Rejected retrimite doar pe zero mișcare', () => {
  const b0: UrmaBanca = { returnat: 0, cerut: 0, returnabil: 150 };
  it('Accepted → finalizează; Manual → blocat (fără retrimitere, oricare urmă)', () => {
    expect(deciziaVerificare('Accepted', b0, null, 150)).toBe('finalizeaza');
    expect(deciziaVerificare('Manual', b0, b0, 150)).toBe('blocheaza');
    expect(deciziaVerificare('manual', b0, null, 150)).toBe('blocheaza');
  });
  it('Rejected: zero mișcare → refuz (retrimitere cu pauză); mișcare → blocat; banca necitită → așteaptă', () => {
    expect(deciziaVerificare('Rejected', b0, b0, 150)).toBe('refuza');
    expect(deciziaVerificare('Rejected', b0, { returnat: 0, cerut: 150, returnabil: 0 }, 150)).toBe('blocheaza');
    expect(deciziaVerificare('Rejected', b0, { returnat: 50, cerut: 0, returnabil: 100 }, 150)).toBe('blocheaza');
    expect(deciziaVerificare('Rejected', b0, null, 150)).toBe('asteapta');
  });
  it('Created / Requested → încă în curs', () => {
    for (const s of ['Created', 'Requested', '']) expect(deciziaVerificare(s, b0, b0, 150)).toBe('asteapta');
  });
});

describe('workerul (refund-intentii.ts) folosește regulile de mai sus', () => {
  const src = readFileSync(path.join(__dirname, 'refund-intentii.ts'), 'utf8');
  it('H1: verificarea refund-ului străin vine ÎNAINTEA marcajului «trimisa_necunoscut» și a POST-ului', () => {
    const h1 = src.indexOf('const st = decizieRefundStrain(');
    expect(h1).toBeGreaterThan(0);
    expect(h1).toBeLessThan(src.indexOf("stare: 'trimisa_necunoscut', incercari"));
    expect(h1).toBeLessThan(src.indexOf('await refundPayment('));
  });
  it('L1: refuzul clar trece prin refuzClarMaib (429 nu reactivează); H2: verificarea trece prin deciziaVerificare', () => {
    expect(src).toContain('refuzClarMaib(e.status)');
    expect(src).toContain('deciziaVerificare(r.status, bazaIntentiei(i), urmaAcum, i.suma)');
    expect(src).not.toMatch(/if \(d === 'respins'\) return refuza/);
  });
});
