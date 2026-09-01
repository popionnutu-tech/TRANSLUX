import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Frazele rostite trăiesc în route (sursa) și, în copie, în seed-ul testelor EL
// (mjs nu poate importa TS). O copie care se depărtează de original face testul
// de la ElevenLabs să treacă pe un text pe care agentul nu-l primește niciodată.
const root = join(__dirname, '../../../../..');
const route = readFileSync(join(root, 'apps/admin/src/app/api/voice-tools/register-complaint/route.ts'), 'utf-8');
const seed = readFileSync(join(root, 'scripts/voice-agent/seed-complaint-tests.mjs'), 'utf-8');

function phrase(src: string, field: string): string {
  const m = src.match(new RegExp(`${field}: '([^']+)'`));
  if (!m) throw new Error(`${field} lipsește`);
  return m[1];
}

describe('frazele reclamației sunt aceleași în route și în testele EL', () => {
  for (const field of ['refusal_line_ro', 'refusal_line_ru', 'confirm_line_ro', 'confirm_line_ru']) {
    it(field, () => {
      expect(phrase(seed, field)).toBe(phrase(route, field));
    });
  }
});
