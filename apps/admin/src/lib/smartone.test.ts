import { describe, it, expect } from 'vitest';
import { cecCatreSmartOne, semneaza, corpCerere } from './smartone';

describe('SmartOne — semnătura', () => {
  // VECTORUL OFICIAL din documentație (docs.smartoneclub.com, 1.4 Processing request examples).
  // Fără el, ordinea concatenării `data + merchantID` ar fi fost o presupunere — iar o semnătură greșită
  // nu dă un mesaj clar, terminalul doar refuză.
  const data = 'eyJkb2NOdW1iZXIiOiAgIjEyMyIsImVtcGxveWVlTmFtZSI6ICLQmNCy0LDQvdC+0LIiLCJhbW91bnQiOiAgMTUwMDAsImN1cnJlbmN5IjogIkFaTiIsCiAiaXRlbXMiOiBbeyJpdGVtSWQiOiAiMTExMSIsICJpdGVtTmFtZSI6ICLQodC10LzQtdGH0LrQuCIsICJpdGVtUVJDb2RlIjogIiIsICJpdGVtUXR5IjogMjAwMCwKICJpdGVtQW1vdW50IjogMTUwMDAsImRpc2NvdW50IjogMCwiaXRlbVRheGVzIjogW3sidGF4TmFtZSI6ICLQndCU0KEiLCJ0YXhQcmMiOiAxODAwfV19XSwKICJwYXltZW50cyIgOiB7ImNhc2hBbW91bnQiOiAxNTAwMCwiY2FzaGxlc3NBbW91bnQiOiAwLCJvdGhlckFtb3VudCI6IDB9fQ==';
  const merchant = '9662a13f5b4f46dbb1751bbbf86ed402';

  it('reproduce semnătura din documentația oficială', async () => {
    expect(await semneaza(data, merchant)).toBe('ZmNlOTU1MjlkNzI0NjYxOTE2ODNlMDJiMTdhOGIxMjA0YzE2NWE0OQ==');
  });
});

describe('SmartOne — cecul nostru în formatul terminalului', () => {
  const cec = {
    doc_id: 530, total: 780, plata: 'NUMERAR', incasat: 1000,
    linii: [{ nume: 'Фонарь задний 0393LL76', nume_bon: 'Фонарь задний', articol: '0393LL76',
              cant: 1, pret: 780, suma: 780, cota_tva: 20 }],
  };

  it('trece sumele în bani, cantitățile în miimi, TVA ×100', () => {
    const d = cecCatreSmartOne(cec, 'Eduard');
    expect(d.amount).toBe(78000);              // 780,00 lei
    expect(d.items[0].itemAmount).toBe(78000);
    expect(d.items[0].itemQty).toBe(1000);     // o bucată
    expect(d.items[0].itemTaxes[0].taxPrc).toBe(2000); // 20%
    expect(d.currency).toBe('MDL');
  });

  it('trimite numele SCURT de bon, nu denumirea din catalog', () => {
    // Rostul câmpului din migr. 393: aparatul taie denumirea la o limită fixă.
    expect(cecCatreSmartOne(cec, 'Eduard').items[0].itemName).toBe('Фонарь задний');
  });

  it('pune toată suma pe numerar la plata în numerar, nu suma încasată', () => {
    // Pe bon merge suma DOCUMENTULUI; restul îl calculează casa. `incasat` 1000 n-are ce căuta aici.
    const p = cecCatreSmartOne(cec, 'Eduard').payments;
    expect(p).toEqual({ cashAmount: 78000, cashlessAmount: 0, otherAmount: 0 });
  });

  it('mută suma pe card când plata e cu cardul', () => {
    const p = cecCatreSmartOne({ ...cec, plata: 'CARD' }, 'Eduard').payments;
    expect(p).toEqual({ cashAmount: 0, cashlessAmount: 78000, otherAmount: 0 });
  });

  it('nu se sufocă la denumiri chirilice când face base64', async () => {
    // `btoa` singur aruncă pe caractere non-latine, iar denumirile noastre sunt aproape toate chirilice.
    const corp = await corpCerere(cecCatreSmartOne(cec, 'Eduard'), 'test-merchant');
    expect(corp).toMatch(/^data=.+&sign=.+$/);
  });
});
