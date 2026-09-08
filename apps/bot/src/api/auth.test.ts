import { describe, expect, it } from 'vitest';
import { bearerToken, displayName, generateToken, hashToken, isPeronUser } from './auth.js';
import type { User } from '@translux/db';

describe('hashToken', () => {
  it('e determinist și dă sha256 hex de 64 de caractere', () => {
    const a = hashToken('abc');
    expect(a).toBe(hashToken('abc'));
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    // sha256("abc") — valoare cunoscută
    expect(a).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('token-uri diferite → hash-uri diferite', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('generateToken', () => {
  it('32 de octeți aleatori în hex, unic la fiecare apel', () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(generateToken()).not.toBe(t);
  });
});

describe('bearerToken', () => {
  const tok = 'a'.repeat(64);
  it('extrage token-ul din Authorization: Bearer', () => {
    expect(bearerToken({ headers: { authorization: `Bearer ${tok}` } })).toBe(tok);
    expect(bearerToken({ headers: { authorization: `Bearer ${tok.toUpperCase()}` } })).toBe(tok);
  });
  it('refuză antet lipsă, altă schemă sau token de altă formă', () => {
    expect(bearerToken({ headers: {} })).toBeNull();
    expect(bearerToken({ headers: { authorization: `Basic ${tok}` } })).toBeNull();
    expect(bearerToken({ headers: { authorization: 'Bearer abc' } })).toBeNull();
    expect(bearerToken({ headers: { authorization: `Bearer ${tok}x` } })).toBeNull();
  });
});

describe('isPeronUser', () => {
  const base: User = {
    id: 'u1', telegram_id: 1, username: 'op', role: 'CONTROLLER', point: 'CHISINAU',
    operator_kind: 'MAIN', active: true, created_at: '',
  };
  it('acceptă CONTROLLER activ din Chișinău sau Bălți', () => {
    expect(isPeronUser(base)).toBe(true);
    expect(isPeronUser({ ...base, point: 'BALTI' })).toBe(true);
  });
  it('refuză inactiv, alt rol, fără punct', () => {
    expect(isPeronUser({ ...base, active: false })).toBe(false);
    expect(isPeronUser({ ...base, role: 'ADMIN' })).toBe(false);
    expect(isPeronUser({ ...base, point: null })).toBe(false);
    expect(isPeronUser(null)).toBe(false);
  });
  it('displayName: @username sau null', () => {
    expect(displayName(base)).toBe('@op');
    expect(displayName({ username: null })).toBeNull();
  });
});
