import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { efectEveniment, verificaWebhookResend } from './webhook-semnatura';

const cheie = Buffer.from('cheie-de-proba-pentru-webhook-resend');
const secret = `whsec_${cheie.toString('base64')}`;
const corp = '{"type":"email.bounced","data":{"email_id":"abc"}}';
const now = Date.parse('2026-10-05T12:00:00Z');
const ts = String(Math.floor(now / 1000));
const semneaza = (c: string, t: string, id = 'msg_1') => `v1,${createHmac('sha256', cheie).update(`${id}.${t}.${c}`).digest('base64')}`;

describe('verificaWebhookResend', () => {
  it('semnătura corectă → da (și când e a doua din listă)', () => {
    expect(verificaWebhookResend({ corp, id: 'msg_1', timestamp: ts, semnatura: semneaza(corp, ts), secret, nowMs: now })).toBe(true);
    expect(verificaWebhookResend({ corp, id: 'msg_1', timestamp: ts, semnatura: `v1,AAAA ${semneaza(corp, ts)}`, secret, nowMs: now })).toBe(true);
  });
  it('corp schimbat, alt id, secret greșit sau antet lipsă → nu', () => {
    expect(verificaWebhookResend({ corp: corp + ' ', id: 'msg_1', timestamp: ts, semnatura: semneaza(corp, ts), secret, nowMs: now })).toBe(false);
    expect(verificaWebhookResend({ corp, id: 'msg_2', timestamp: ts, semnatura: semneaza(corp, ts), secret, nowMs: now })).toBe(false);
    expect(verificaWebhookResend({ corp, id: 'msg_1', timestamp: ts, semnatura: semneaza(corp, ts), secret: 'whsec_YWx0YQ==', nowMs: now })).toBe(false);
    expect(verificaWebhookResend({ corp, id: null, timestamp: ts, semnatura: semneaza(corp, ts), secret, nowMs: now })).toBe(false);
  });
  it('timestamp mai vechi de 5 min → nu (reluare)', () => {
    const vechi = String(Math.floor(now / 1000) - 400);
    expect(verificaWebhookResend({ corp, id: 'msg_1', timestamp: vechi, semnatura: semneaza(corp, vechi), secret, nowMs: now })).toBe(false);
  });
});

describe('efectEveniment', () => {
  it('bounce / spam / eșec → eșec cu motiv; livrat; restul ignorat', () => {
    expect(efectEveniment('email.bounced', { bounce: { type: 'Permanent', message: 'mailbox does not exist' } }))
      .toEqual({ fel: 'esec', motiv: 'respins (bounce Permanent): mailbox does not exist' });
    expect(efectEveniment('email.complained', null).fel).toBe('esec');
    expect(efectEveniment('email.failed', null).fel).toBe('esec');
    expect(efectEveniment('email.delivered', null)).toEqual({ fel: 'livrat' });
    expect(efectEveniment('email.delivery_delayed', null)).toEqual({ fel: 'ignorat' });
  });
});
