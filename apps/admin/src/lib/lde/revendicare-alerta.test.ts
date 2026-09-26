import { describe, it, expect } from 'vitest';
import { trimiteOdata, type RandAlerta } from './revendicare-alerta';

// Revendicarea (copia din lde-timp-liber/route.ts): un singur UPDATE atomic pe versiunea citită, cu exact aceleași filtre.
type Apel = { update: unknown; eq: [string, unknown][]; or?: string; select?: string };
function sbFals(luate: number, eroare?: string) {
  const apeluri: Apel[] = [];
  const sb = {
    from: (t: string) => {
      expect(t).toBe('lde_analiza_reguli');
      return {
        update: (u: unknown) => {
          const a: Apel = { update: u, eq: [] }; apeluri.push(a);
          const q = {
            eq: (k: string, v: unknown) => { a.eq.push([k, v]); return q; },
            or: (s: string) => { a.or = s; return q; },
            select: async (s: string) => { a.select = s; return { data: eroare ? null : Array.from({ length: luate }, () => ({ id: '1' })), error: eroare ? { message: eroare } : null }; },
            then: (r: (x: unknown) => void) => r({ error: null }),
          };
          return q;
        },
      };
    },
  };
  return { sb: sb as never, apeluri };
}
const row: RandAlerta = { id: 'r1', saptamina: '2026-09-14', rulat_la: '2026-09-21T06:00:00Z', alerta_trimisa_la: null };
const ACUM = '2026-09-21T07:00:00Z';

describe('trimiteOdata', () => {
  it('revendică cu filtrele exacte, apoi trimite', async () => {
    const { sb, apeluri } = sbFals(1); let n = 0;
    const r = await trimiteOdata(sb, row, 'text', async () => { n++; return true; }, { acum: ACUM });
    expect(r).toEqual({ trimis: true }); expect(n).toBe(1);
    expect(apeluri[0]).toEqual({ update: { alerta_trimisa_la: ACUM }, eq: [['id', 'r1'], ['rulat_la', row.rulat_la]],
      or: `alerta_trimisa_la.is.null,alerta_trimisa_la.lt."${row.rulat_la}"`, select: 'id' });
  });
  it('revendicarea luată de altcineva → nu trimite', async () => {
    const { sb } = sbFals(0); let n = 0;
    expect(await trimiteOdata(sb, row, 'text', async () => { n++; return true; })).toEqual({ trimis: false, deja_trimis: true }); expect(n).toBe(0);
  });
  it('deja trimis după rulare → nimic, fără UPDATE; force trimite și scrie coloana', async () => {
    const vechi = { ...row, alerta_trimisa_la: '2026-09-21T06:30:00Z' };
    const a = sbFals(1); expect(await trimiteOdata(a.sb, vechi, 't', async () => true)).toEqual({ trimis: false, deja_trimis: true }); expect(a.apeluri).toHaveLength(0);
    const b = sbFals(1); expect(await trimiteOdata(b.sb, vechi, 't', async () => true, { force: true, acum: ACUM })).toEqual({ trimis: true });
    expect(b.apeluri).toEqual([{ update: { alerta_trimisa_la: ACUM }, eq: [['id', 'r1']] }]);
  });
  it('Telegram refuză → coloana revine condiționat, 502', async () => {
    const { sb, apeluri } = sbFals(1);
    expect(await trimiteOdata(sb, row, 't', async () => false, { acum: ACUM })).toMatchObject({ trimis: false, status: 502 });
    expect(apeluri[1]).toEqual({ update: { alerta_trimisa_la: null }, eq: [['id', 'r1'], ['alerta_trimisa_la', ACUM]] });
  });
  it('eroarea revendicării → 500, fără trimitere', async () => {
    const { sb } = sbFals(0, 'x'); let n = 0;
    expect(await trimiteOdata(sb, row, 't', async () => { n++; return true; })).toMatchObject({ trimis: false, status: 500 }); expect(n).toBe(0);
  });
});
