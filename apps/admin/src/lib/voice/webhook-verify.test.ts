import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyElevenLabsSignature } from './webhook-verify';

const SECRET = 'wsec_test';
function sign(body: string, ts: number): string {
  const mac = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
  return `t=${ts},v0=${mac}`;
}

describe('verifyElevenLabsSignature', () => {
  const now = 1_800_000_000_000; // фиксированное "сейчас"
  const body = '{"type":"post_call_transcription"}';

  it('принимает корректную свежую подпись', () => {
    const ts = Math.floor(now / 1000) - 60;
    expect(verifyElevenLabsSignature(body, sign(body, ts), SECRET, now)).toBe(true);
  });

  it('отклоняет подпись с другим секретом', () => {
    const ts = Math.floor(now / 1000);
    const bad = sign(body, ts).replace(/v0=.{8}/, 'v0=00000000');
    expect(verifyElevenLabsSignature(body, bad, SECRET, now)).toBe(false);
  });

  it('отклоняет изменённое тело', () => {
    const ts = Math.floor(now / 1000);
    expect(verifyElevenLabsSignature(body + 'x', sign(body, ts), SECRET, now)).toBe(false);
  });

  it('отклоняет replay старше 30 минут', () => {
    const ts = Math.floor(now / 1000) - 31 * 60;
    expect(verifyElevenLabsSignature(body, sign(body, ts), SECRET, now)).toBe(false);
  });

  it('отклоняет null/мусорный заголовок', () => {
    expect(verifyElevenLabsSignature(body, null, SECRET, now)).toBe(false);
    expect(verifyElevenLabsSignature(body, 'garbage', SECRET, now)).toBe(false);
  });
});
