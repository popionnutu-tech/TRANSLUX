import { describe, it, expect, vi } from 'vitest';

// Posterul Drăxlmaier (F3, §10.5): «cât costă azi», card = Σ rândurilor, «din care de lămurit»; doar km — fără lei, fără casă,
// fără «economie posibilă»; nimic nu pleacă din generare.
const scris: string[] = [];
const trimise: unknown[] = [];
vi.mock('../poster-sablon', () => ({
  CULORI: { gri: '', text: '', verde: '', verdeFundal: '' },
  poster: (o: Record<string, string>) => {
    scris.push(...Object.values(o).map(String));
    return {
      carduri: (c: Record<string, string>[]) => c.forEach((x) => scris.push(...Object.values(x))),
      tabel: (_c: unknown, r: { text: string }[][]) => r.forEach((row) => row.forEach((x) => scris.push(x.text))),
      total: (t: string) => scris.push(t), nota: (t: string) => scris.push(t), png: async () => Buffer.from('png'),
    };
  },
}));
vi.mock('../telegram-notify', () => ({ sendTelegramPhoto: vi.fn(async (...a: unknown[]) => { trimise.push(a); return { ok: true }; }), escapeHtml: (s: string) => s }));
vi.mock('../supabase', () => ({ getSupabase: () => { throw new Error('generarea nu citește baza'); } }));

import { generateDraxOptimizariImage } from './drax-optimizari-image';
import { fixtureDrax } from './drax-fixture.test-util';

describe('posterul Drăxlmaier', () => {
  it('doar km, fără lei / casă / «economie posibilă»; cardurile = Σ rândurilor; «din care de lămurit»', async () => {
    const a = fixtureDrax();
    const png = await generateDraxOptimizariImage(a);
    expect(png.toString()).toBe('png');
    const t = scris.join('\n');
    expect(t).not.toMatch(/\blei\b/i);
    expect(t).not.toMatch(/economie posibil/i);
    expect(t).not.toContain('Zăicani');
    expect(t).toContain('Cât costă azi drumul casă – rută');
    const sum = (k: 'B' | 'R1a') => Math.round(a.masini.reduce((s, m) => s + (m.extrapolat[k] ?? 0), 0));
    expect(t).toContain(`${sum('B').toLocaleString('ro-RO').replace(/ /g, ' ')} km`);
    expect(t).toContain('din care 707 km de lămurit');
    expect(t).toContain('R8 – Costesti');
    expect(trimise).toHaveLength(0);
  });
});
