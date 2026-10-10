import { describe, expect, it } from 'vitest';
import { clasificaComanda, clasificaPlata, deciziaSesiune, inFereastraFaraSofer, ordineRotatie, rezervareExpirata, sesiuneDeInchis, sesiuneInchisa, VARSTA_MIN_MS } from './impacare-reguli';

const now = Date.parse('2026-10-14T10:00:00+03:00');
const veche = new Date(now - VARSTA_MIN_MS - 1000).toISOString();
const proaspata = new Date(now - 5 * 60_000).toISOString();

describe('clasificaComanda', () => {
  it('noua veche fără checkout → fara_checkout; cu checkout → cu_checkout; proaspătă → nimic', () => {
    expect(clasificaComanda({ status: 'noua', checkout_id: null, created_at: veche, refund_finalizat_la: null }, now)).toBe('fara_checkout');
    expect(clasificaComanda({ status: 'eroare_creare', checkout_id: null, created_at: veche, refund_finalizat_la: null }, now)).toBe('fara_checkout');
    expect(clasificaComanda({ status: 'noua', checkout_id: 'x', created_at: veche, refund_finalizat_la: null }, now)).toBe('cu_checkout');
    expect(clasificaComanda({ status: 'noua', checkout_id: null, created_at: proaspata, refund_finalizat_la: null }, now)).toBe('nimic');
  });
  it('anulata nefinalizată → refund; finalizată → nimic; platita/expirata/returnata → nimic', () => {
    expect(clasificaComanda({ status: 'anulata', checkout_id: 'x', created_at: veche, refund_finalizat_la: null }, now)).toBe('refund');
    expect(clasificaComanda({ status: 'anulata', checkout_id: 'x', created_at: veche, refund_finalizat_la: '2026-10-14T09:00:00Z' }, now)).toBe('nimic');
    for (const s of ['platita', 'expirata', 'returnata', 'platita_fara_bilet']) {
      expect(clasificaComanda({ status: s, checkout_id: 'x', created_at: veche, refund_finalizat_la: null }, now)).toBe('nimic');
    }
  });
});

describe('sesiuneInchisa', () => {
  it('Expired/Cancelled/Failed/Abandoned (orice capitalizare) → închisă; Completed/Waitingforinit → nu', () => {
    for (const s of ['Expired', 'cancelled', 'FAILED', 'Abandoned']) expect(sesiuneInchisa(s)).toBe(true);
    for (const s of ['Completed', 'Waitingforinit', 'Initialized', null, undefined]) expect(sesiuneInchisa(s)).toBe(false);
  });
});

describe('inFereastraFaraSofer', () => {
  it('plecarea în 2 h → da; în 4 h → nu; deja plecată → nu', () => {
    expect(inFereastraFaraSofer('2026-10-14T12:00:00+03:00', now)).toBe(true);
    expect(inFereastraFaraSofer('2026-10-14T14:00:00+03:00', now)).toBe(false);
    expect(inFereastraFaraSofer('2026-10-14T09:00:00+03:00', now)).toBe(false);
  });
});

// 560 — sesiunile, rezervarea și plata târzie (dezbaterea Claude ⇄ Codex 10.10.2026: C2 + D2 + C4).
describe('rezervarea: created_at + 30 min, neprelungită', () => {
  it('la 29:59 e vie, la 30:00 a expirat; data nevalidă = expirată', () => {
    const creat = '2026-10-14T09:00:00+03:00';
    expect(rezervareExpirata(creat, Date.parse(creat) + VARSTA_MIN_MS - 1000)).toBe(false);
    expect(rezervareExpirata(creat, Date.parse(creat) + VARSTA_MIN_MS)).toBe(true);
    expect(rezervareExpirata('x', now)).toBe(true);
  });
});

describe('sesiuneDeInchis: expirată la noi, rezervare expirată sau cursa plecată', () => {
  const plecareDeparte = new Date(now + 5 * 3_600_000).toISOString();
  it('proaspătă, plecarea departe → nu; rezervare expirată → da; «expirata» → da', () => {
    expect(sesiuneDeInchis({ status: 'noua', created_at: proaspata, departure_at: plecareDeparte }, now)).toBe(false);
    expect(sesiuneDeInchis({ status: 'noua', created_at: veche, departure_at: plecareDeparte }, now)).toBe(true);
    expect(sesiuneDeInchis({ status: 'expirata', created_at: proaspata, departure_at: plecareDeparte }, now)).toBe(true);
  });
  it('proaspătă, dar cursa a plecat → da (vânzarea s-a închis)', () => {
    expect(sesiuneDeInchis({ status: 'noua', created_at: proaspata, departure_at: new Date(now - 1000).toISOString() }, now)).toBe(true);
    expect(sesiuneDeInchis({ status: 'noua', created_at: proaspata, departure_at: new Date(now + 60_000).toISOString() }, now)).toBe(false);
  });
});

describe('deciziaSesiune: verificare → cancel → reverificare → expirare doar pe închidere confirmată', () => {
  it('Completed → platita (oricând); închisă la bancă → expira', () => {
    for (const d of [true, false]) {
      expect(deciziaSesiune('Completed', d)).toBe('platita');
      expect(deciziaSesiune('completed', d, true)).toBe('platita');
      for (const s of ['Expired', 'Cancelled', 'Failed', 'Abandoned']) expect(deciziaSesiune(s, d)).toBe('expira');
    }
  });
  it('deschisă și de închis → anuleaza; după cancel tot deschisă → asteapta (nu se expiră pe ghicite)', () => {
    for (const s of ['Initialized', 'WaitingForInit', 'Waitingforinit', 'PaymentMethodSelected', null]) {
      expect(deciziaSesiune(s, true)).toBe('anuleaza');
      expect(deciziaSesiune(s, true, true)).toBe('asteapta');
      expect(deciziaSesiune(s, false)).toBe('asteapta');
    }
  });
});

describe('ordineRotatie: nicio comandă nu rămâne în spatele acelorași 10 (Codex C2)', () => {
  it('neverificatele întâi, apoi cea mai demult verificată; la egalitate cea mai veche', () => {
    const xs = [
      { id: 'a', impacare_verificata_la: '2026-10-14T09:50:00Z', created_at: '2026-10-13T10:00:00Z' },
      { id: 'b', impacare_verificata_la: null, created_at: '2026-10-14T08:00:00Z' },
      { id: 'c', impacare_verificata_la: '2026-10-14T09:40:00Z', created_at: '2026-10-14T07:00:00Z' },
      { id: 'd', impacare_verificata_la: null, created_at: '2026-10-14T07:30:00Z' },
    ];
    expect(ordineRotatie(xs).map((x) => x.id)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('simulare: 35 de sesiuni mereu deschise, 10 pe tură, ora scrisă și la eroare → fiecare verificată în 4 ture', () => {
    let lista = Array.from({ length: 35 }, (_, i) => ({ id: `c${i}`, impacare_verificata_la: null as string | null, created_at: new Date(now - (100 - i) * 60_000).toISOString() }));
    const vazute = new Set<string>();
    for (let tura = 0; tura < 4; tura++) {
      const alese = ordineRotatie(lista).slice(0, 10);
      const t = new Date(now + tura * 600_000).toISOString();
      // jumătate «eșuează» la bancă: ora se scrie oricum (finally)
      lista = lista.map((x) => (alese.some((a) => a.id === x.id) ? { ...x, impacare_verificata_la: t } : x));
      alese.forEach((a) => vazute.add(a.id));
    }
    expect(vazute.size).toBe(35);
  });
});

describe('clasificaPlata (portul SQL 560): ora execuției la bancă, nu ora callback-ului', () => {
  const baza = { status: 'noua', departureAt: '2026-10-14T12:00:00+03:00', createdAt: '2026-10-14T10:00:00+03:00', locuriLibere: 5, seats: 1, revalidare: null };
  it('ora necunoscută → nicio clasificare (nu se presupune acum)', () => {
    expect(clasificaPlata({ ...baza, executatLa: null })).toBe('necunoscuta');
    expect(clasificaPlata({ ...baza, executatLa: 'nu' })).toBe('necunoscuta');
  });
  it('executată la timp → emite, chiar dacă callback-ul vine după plecare', () => {
    expect(clasificaPlata({ ...baza, executatLa: '2026-10-14T10:10:00+03:00' })).toBe('emite');
  });
  it('executată la plecare sau după → plata_dupa_plecare (bani înapoi)', () => {
    expect(clasificaPlata({ ...baza, executatLa: '2026-10-14T12:00:00+03:00' })).toBe('plata_dupa_plecare');
    expect(clasificaPlata({ ...baza, status: 'expirata', executatLa: '2026-10-14T13:00:00+03:00' })).toBe('plata_dupa_plecare');
  });
  it('după rezervare / pe comanda expirată: cu loc → emite; fără loc → loc_vandut', () => {
    expect(clasificaPlata({ ...baza, executatLa: '2026-10-14T10:40:00+03:00' })).toBe('emite');
    expect(clasificaPlata({ ...baza, executatLa: '2026-10-14T10:40:00+03:00', locuriLibere: 0 })).toBe('loc_vandut');
    expect(clasificaPlata({ ...baza, status: 'expirata', executatLa: '2026-10-14T10:20:00+03:00', locuriLibere: 0 })).toBe('loc_vandut');
    // la timp, autobuzul plin între timp: rezervarea ținea locul → emite (locul îl dă triggerul / alerta fara_loc)
    expect(clasificaPlata({ ...baza, executatLa: '2026-10-14T10:20:00+03:00', locuriLibere: 0 })).toBe('emite');
  });
  it('revalidarea (cota, returul pe tur anulat, studentul) → același motiv, tot cu bani înapoi', () => {
    expect(clasificaPlata({ ...baza, executatLa: '2026-10-14T10:10:00+03:00', revalidare: 'cota_depasita' })).toBe('cota_depasita');
  });
});
