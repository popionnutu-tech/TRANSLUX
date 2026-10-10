import { describe, expect, it } from 'vitest';
import { filtruPachet, leagaComandaDeTelegram, type DbLegare } from './leaga-telegram';

// N4 (dezbaterea Claude–Codex, 10.10.2026): tur-returul din mini app se leagă de cont ÎNTREG (turul + returul din pachet),
// doar rândurile încă nelegate; contul vine din initData (apelantul), nu din telefon.

const TUR = '0f8fad5b-d9cb-469f-a165-70867728950e';

/** Baza falsă: aplică filtrul `or` + `is(telegram_id, null)` pe rânduri, ca PostgREST. */
function bazaFalsa(randuri: Array<{ id: string; comanda_tur_id: string | null; in_pachet: boolean; telegram_id: number | null; telegram_verificat_pentru: number | null }>) {
  const apeluri: string[] = [];
  const db: DbLegare = {
    from: () => ({
      update: (v) => ({
        or: (filtru) => ({
          is: async () => {
            apeluri.push(filtru);
            const m = /^id\.eq\.([0-9a-f-]+),and\(comanda_tur_id\.eq\.([0-9a-f-]+),in_pachet\.eq\.true\)$/.exec(filtru);
            if (!m) return { error: { message: 'filtru necunoscut' } };
            for (const r of randuri) {
              const potrivit = r.id === m[1] || (r.comanda_tur_id === m[2] && r.in_pachet);
              if (potrivit && r.telegram_id == null) Object.assign(r, v);
            }
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { db, apeluri, randuri };
}

describe('N4: legarea tur-returului de contul Telegram', () => {
  it('turul și returul din pachet primesc contul; alt retur (−20%, nu în pachet) și alte comenzi nu', async () => {
    const b = bazaFalsa([
      { id: TUR, comanda_tur_id: null, in_pachet: false, telegram_id: null, telegram_verificat_pentru: null },
      { id: 'r1', comanda_tur_id: TUR, in_pachet: true, telegram_id: null, telegram_verificat_pentru: null },
      { id: 'r2', comanda_tur_id: TUR, in_pachet: false, telegram_id: null, telegram_verificat_pentru: null },
      { id: 'x', comanda_tur_id: null, in_pachet: false, telegram_id: null, telegram_verificat_pentru: null },
    ]);
    expect(await leagaComandaDeTelegram(b.db, TUR, 555)).toBeNull();
    expect(b.randuri.map((r) => r.telegram_id)).toEqual([555, 555, null, null]);
    expect(b.randuri[1].telegram_verificat_pentru).toBe(555);
  });
  it('un rând deja legat de alt cont rămâne neatins (fără furt de bilet)', async () => {
    const b = bazaFalsa([
      { id: TUR, comanda_tur_id: null, in_pachet: false, telegram_id: null, telegram_verificat_pentru: null },
      { id: 'r1', comanda_tur_id: TUR, in_pachet: true, telegram_id: 777, telegram_verificat_pentru: 777 },
    ]);
    await leagaComandaDeTelegram(b.db, TUR, 555);
    expect(b.randuri[1]).toMatchObject({ telegram_id: 777, telegram_verificat_pentru: 777 });
  });
  it('id nevalid nu intră în filtru; cont nevalid nu leagă nimic', async () => {
    expect(() => filtruPachet('x),id.neq.(0')).toThrow();
    const b = bazaFalsa([{ id: TUR, comanda_tur_id: null, in_pachet: false, telegram_id: null, telegram_verificat_pentru: null }]);
    expect(await leagaComandaDeTelegram(b.db, TUR, 0)).toBe('telegram_id nevalid');
    expect(b.apeluri).toHaveLength(0);
  });
});
