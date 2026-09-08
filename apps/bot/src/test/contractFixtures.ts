/**
 * Contractul cu aplicația Android (docs/specs/peron-app-e2e.md, S03 pasul 4):
 * răspunsurile REALE ale API-ului din testele cap-coadă se salvează ca JSON în
 * `peron-android/src/__fixtures__/`, iar `peron-android/src/contract.ts` le atribuie
 * tipurilor aplicației (`DayResponse`, `ReportResponse`) — `tsc --noEmit` al
 * aplicației pică dacă tipurile nu mai corespund API-ului.
 *
 * Se scrie DOAR cu `WRITE_FIXTURES=1` (fișierele se commit-ează):
 *
 *   WRITE_FIXTURES=1 npm run test --workspace=apps/bot
 *
 * Fără variabilă, dacă fixture-ul există deja, testul compară răspunsul curent cu
 * cel salvat — un API schimbat fără regenerarea fixture-ului e roșu, nu tăcut.
 * Se salvează corpul fără învelișul `ok` (aplicația îl scoate în api.ts `request`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { expect } from 'vitest';

export const FIXTURES_DIR = fileURLToPath(new URL('../../../../peron-android/src/__fixtures__/', import.meta.url));

export type ContractFixture = 'day.chisinau' | 'day.balti' | 'report.ok';

export function fixturePath(name: ContractFixture): string {
  return `${FIXTURES_DIR}${name}.json`;
}

/** Corpul unui răspuns 200 fără `ok` — exact ce primește aplicația din `request<T>()`. */
export function withoutOk<T extends { ok?: unknown }>(body: T): Omit<T, 'ok'> {
  const { ok: _ok, ...rest } = body;
  return rest;
}

/**
 * Scrie fixture-ul (cu WRITE_FIXTURES=1) sau îl compară cu răspunsul curent (dacă
 * există). Întoarce `'written' | 'checked' | 'missing'` ca testul să poată raporta.
 */
export function syncContractFixture(name: ContractFixture, body: unknown): 'written' | 'checked' | 'missing' {
  const path = fixturePath(name);
  const json = `${JSON.stringify(body, null, 2)}\n`;
  if (process.env.WRITE_FIXTURES === '1') {
    mkdirSync(FIXTURES_DIR, { recursive: true });
    writeFileSync(path, json, 'utf8');
    return 'written';
  }
  if (!existsSync(path)) return 'missing';
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  expect(body, `fixture-ul ${name}.json nu mai corespunde API-ului — rulează WRITE_FIXTURES=1 npm run test --workspace=apps/bot`).toEqual(saved);
  return 'checked';
}
