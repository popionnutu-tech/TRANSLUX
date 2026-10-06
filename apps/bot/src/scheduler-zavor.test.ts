import { describe, expect, it, vi } from 'vitest';

describe('ION-274: rulareFaraSuprapunere — ruleazaAcum prin același zăvor', () => {
  it('apel în timp ce jobul rulează → încă o trecere la final, niciodată două în paralel', async () => {
    vi.useFakeTimers();
    const { rulareFaraSuprapunere } = await import('./scheduler.js');
    let inParalel = 0, maxParalel = 0, treceri = 0;
    let elibereaza: () => void = () => undefined;
    const acum = rulareFaraSuprapunere('test', 60_000, async () => {
      inParalel++; maxParalel = Math.max(maxParalel, inParalel); treceri++;
      if (treceri === 1) await new Promise<void>((r) => { elibereaza = r; });
      inParalel--;
    });
    acum();            // pornește trecerea 1 (blocată)
    acum(); acum();    // cer încă o trecere (una singură, oricâte cereri)
    await Promise.resolve();
    elibereaza();
    await vi.runAllTimersAsync().catch(() => undefined);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(maxParalel).toBe(1);
    expect(treceri).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });
});
