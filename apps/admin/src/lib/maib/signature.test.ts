import { describe, it, expect } from 'vitest';
import { maibCallbackSignature, verifyMaibCallback, MAIB_CALLBACK_MAX_SKEW_MS } from './signature';

// Exemplul publicat de maib (Callback Notifications → Signature Example), cuvânt cu cuvânt.
const KEY = '67be8e54-ac28-485d-9369-27f6d3c55a27';
const TS = '1761032516817';
const SIG = 'mtFkCMxfwj9t2wvY/7JASHLw+K/du4mY8azf1lV0ttg=';
const BODY_DOCS = '{"checkoutId": "5a4d27a4-79f5-426b-9403-cccdeee81747","terminalId": "T1234567","amount": 1234.56,"currency": "MDL","completedAt": "2024-11-23T19:35:00.6772285+02:00","payerName": "John","payerEmail": "Smith","payerPhone": "37368473653","payerIp": "192.175.12.22","orderId": "ORDER-2025-0001","orderDescription": "Online purchase of electronics","orderDeliveryAmount": 50.00,"orderDeliveryCurrency": "MDL","paymentId": "379b31a3-8283-43d4-8a7b-eef8c0736a32","paymentAmount": 1234.56,"paymentCurrency": "MDL","paymentStatus": "Executed","paymentExecutedAt": "2025-05-05T23:38:07.2760698+03:00","senderIban": "NL43RABO1438227787","senderName": "Steven","senderCardNumber": "444433******1111","retrievalReferenceNumber": "ABC324353245","processingStatus": "OK","processingStatusCode": "00","approvalCode": "123456","threeDsResult": "Y","threeDsReason": null,"paymentMethod": "Card"}';
const NOW = Number(TS) + 1000;

describe('semnătura callback-ului maib', () => {
  it('reproduce exemplul din documentație pe corpul EXACT cum e transmis (cu spațiu după două puncte)', () => {
    expect(maibCallbackSignature(BODY_DOCS, TS, KEY)).toBe(SIG);
  });

  it('corpul re-serializat compact dă ALTĂ semnătură — de aceea semnăm octeții bruți', () => {
    const compact = BODY_DOCS.replace(/": /g, '":');
    expect(maibCallbackSignature(compact, TS, KEY)).not.toBe(SIG);
  });

  it('acceptă antetul sha256=<base64> în fereastra de timp', () => {
    expect(verifyMaibCallback(BODY_DOCS, `sha256=${SIG}`, TS, KEY, NOW)).toEqual({ ok: true });
  });

  it('acceptă și hex minuscule (docs: «lowercase hex or Base64»)', () => {
    const hex = maibCallbackSignature(BODY_DOCS, TS, KEY, 'hex');
    expect(verifyMaibCallback(BODY_DOCS, `sha256=${hex}`, TS, KEY, NOW)).toEqual({ ok: true });
    expect(verifyMaibCallback(BODY_DOCS, `sha256=${hex.toUpperCase()}`, TS, KEY, NOW)).toEqual({ ok: true });
  });

  it('respinge corpul modificat, cheia greșită, antetul lipsă sau fără prefix', () => {
    expect(verifyMaibCallback(BODY_DOCS.replace('1234.56', '1.00'), `sha256=${SIG}`, TS, KEY, NOW).ok).toBe(false);
    expect(verifyMaibCallback(BODY_DOCS, `sha256=${SIG}`, TS, 'alta-cheie', NOW).ok).toBe(false);
    expect(verifyMaibCallback(BODY_DOCS, null, TS, KEY, NOW)).toEqual({ ok: false, motiv: 'fără X-Signature' });
    expect(verifyMaibCallback(BODY_DOCS, SIG, TS, KEY, NOW).ok).toBe(false);
    expect(verifyMaibCallback(BODY_DOCS, `sha256=${SIG}`, null, KEY, NOW)).toEqual({ ok: false, motiv: 'fără X-Signature-Timestamp' });
    expect(verifyMaibCallback(BODY_DOCS, `sha256=${SIG}`, TS, '', NOW).ok).toBe(false);
  });

  it('respinge replay-ul: timestamp mai vechi decât fereastra, sau nenumeric', () => {
    expect(verifyMaibCallback(BODY_DOCS, `sha256=${SIG}`, TS, KEY, NOW + MAIB_CALLBACK_MAX_SKEW_MS + 1).ok).toBe(false);
    expect(verifyMaibCallback(BODY_DOCS, `sha256=${SIG}`, TS, KEY, NOW - MAIB_CALLBACK_MAX_SKEW_MS - 2000).ok).toBe(false);
    expect(verifyMaibCallback(BODY_DOCS, `sha256=${SIG}`, '2024-11-23T19:35:00Z', KEY, NOW).ok).toBe(false);
  });

  it('semnătura cu timestamp străin nu trece (timestamp-ul intră în mesaj)', () => {
    expect(verifyMaibCallback(BODY_DOCS, `sha256=${SIG}`, String(Number(TS) + 1), KEY, NOW).ok).toBe(false);
  });
});
