import { describe, expect, it } from 'vitest';
import { cheieProbaValida, dataProbaPermisa, pasiProba, telefonMascat } from './proba-reguli';

const CHEIE = 'k'.repeat(43);

describe('cheieProbaValida — pagina de probă fără login (532)', () => {
  it('cheia corectă, în termen → da', () => {
    expect(cheieProbaValida(CHEIE, { cheie: CHEIE, panaLa: '2026-10-10' }, '2026-10-08')).toBe(true);
    expect(cheieProbaValida(CHEIE, { cheie: CHEIE, panaLa: '2026-10-08' }, '2026-10-08')).toBe(true);
  });
  it('cheie greșită, lipsă, de alt tip → nu', () => {
    expect(cheieProbaValida('k'.repeat(42), { cheie: CHEIE, panaLa: '2026-10-10' }, '2026-10-08')).toBe(false);
    expect(cheieProbaValida('', { cheie: CHEIE, panaLa: '2026-10-10' }, '2026-10-08')).toBe(false);
    expect(cheieProbaValida(undefined, { cheie: CHEIE, panaLa: '2026-10-10' }, '2026-10-08')).toBe(false);
    expect(cheieProbaValida(['x'], { cheie: CHEIE, panaLa: '2026-10-10' }, '2026-10-08')).toBe(false);
  });
  it('fail-closed: fără cheie configurată, cheie scurtă, fără termen, termen trecut → nu', () => {
    expect(cheieProbaValida('', { cheie: '', panaLa: '2026-10-10' }, '2026-10-08')).toBe(false);
    expect(cheieProbaValida('scurta', { cheie: 'scurta', panaLa: '2026-10-10' }, '2026-10-08')).toBe(false);
    expect(cheieProbaValida(CHEIE, { cheie: CHEIE, panaLa: null }, '2026-10-08')).toBe(false);
    expect(cheieProbaValida(CHEIE, { cheie: CHEIE, panaLa: 'mâine' }, '2026-10-08')).toBe(false);
    expect(cheieProbaValida(CHEIE, { cheie: CHEIE, panaLa: '2026-10-07' }, '2026-10-08')).toBe(false);
  });
});

describe('dataProbaPermisa', () => {
  it('doar azi sau mâine', () => {
    expect(dataProbaPermisa('2026-10-08', '2026-10-08', '2026-10-09')).toBe(true);
    expect(dataProbaPermisa('2026-10-09', '2026-10-08', '2026-10-09')).toBe(true);
    expect(dataProbaPermisa('2026-10-10', '2026-10-08', '2026-10-09')).toBe(false);
    expect(dataProbaPermisa('2026-10-10', '2026-10-08', '2026-10-09', '2026-10-10')).toBe(true);
    expect(dataProbaPermisa('2026-10-11', '2026-10-08', '2026-10-09', '2026-10-10')).toBe(false);
    expect(dataProbaPermisa('2026-10-07', '2026-10-08', '2026-10-09')).toBe(false);
    expect(dataProbaPermisa(null, '2026-10-08', '2026-10-09')).toBe(false);
  });
});

describe('telefonMascat', () => {
  it('ascunde mijlocul', () => {
    expect(telefonMascat('37369123456')).toBe('+373 69 ••• 456');
    expect(telefonMascat('')).toBe('•••');
  });
});

describe('pasiProba', () => {
  const baza = { status: 'platita', email: 'a@b.md', email_livrat_la: '2026-10-08T07:00:00Z', telegram_id: 1, bilete: [{ status: 'urcat' }] };
  it('comanda scanată: toate bifele până la scanat, returnat nu', () => {
    expect(pasiProba(baza)).toEqual({ creata: true, platita: true, email: true, telegram: true, scanat: true, returnat: false });
  });
  it('comanda nouă, fără e-mail: e-mailul nu se aplică', () => {
    expect(pasiProba({ ...baza, status: 'noua', email: null, email_livrat_la: null, telegram_id: null, bilete: [] }))
      .toEqual({ creata: true, platita: false, email: null, telegram: false, scanat: false, returnat: false });
  });
  it('comanda returnată: plătită și returnată', () => {
    expect(pasiProba({ ...baza, status: 'returnata', bilete: [{ status: 'returnat' }] })).toMatchObject({ platita: true, scanat: false, returnat: true });
  });
});
