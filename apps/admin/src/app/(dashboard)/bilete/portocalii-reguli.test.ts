import { describe, expect, it } from 'vitest';
import { clasaScanare, esteDinCoadaOffline, estePortocalie, grupeazaPeZi } from './portocalii-reguli';

const S = '2026-10-14T05:00:00.000Z';

describe('esteDinCoadaOffline', () => {
  it('fără moment_client sau cu dată stricată → nu e offline', () => {
    expect(esteDinCoadaOffline(null, S)).toBe(false);
    expect(esteDinCoadaOffline('abc', S)).toBe(false);
  });
  it('clientul cu ≤ 2 min înaintea serverului → online; peste 2 min → offline', () => {
    expect(esteDinCoadaOffline('2026-10-14T04:59:30.000Z', S)).toBe(false);
    expect(esteDinCoadaOffline('2026-10-14T04:58:00.000Z', S)).toBe(false); // exact 2 min nu e «mai vechi»
    expect(esteDinCoadaOffline('2026-10-14T04:57:59.000Z', S)).toBe(true);
    expect(esteDinCoadaOffline('2026-10-14T03:00:00.000Z', S)).toBe(true);
  });
  it('ceasul clientului înaintea serverului (în viitor) → nu e offline', () => {
    expect(esteDinCoadaOffline('2026-10-14T05:10:00.000Z', S)).toBe(false);
  });
});

describe('clasaScanare + estePortocalie', () => {
  it('ok → ok; neconfirmat → neconfirmată; restul → invalidă', () => {
    expect(clasaScanare('ok')).toBe('ok');
    expect(clasaScanare('neconfirmat')).toBe('neconfirmata');
    for (const r of ['deja_urcat', 'anulat', 'alta_cursa', 'necunoscut']) expect(clasaScanare(r)).toBe('invalida');
  });
  it('ok online nu e portocalie; ok din coada offline este; orice ne-ok este', () => {
    expect(estePortocalie({ rezultat: 'ok', moment_client: '2026-10-14T04:59:50.000Z', moment_server: S })).toBe(false);
    expect(estePortocalie({ rezultat: 'ok', moment_client: null, moment_server: S })).toBe(false);
    expect(estePortocalie({ rezultat: 'ok', moment_client: '2026-10-14T04:00:00.000Z', moment_server: S })).toBe(true);
    expect(estePortocalie({ rezultat: 'neconfirmat', moment_client: null, moment_server: S })).toBe(true);
    expect(estePortocalie({ rezultat: 'alta_cursa', moment_client: '2026-10-14T04:59:59.000Z', moment_server: S })).toBe(true);
  });
});

describe('grupeazaPeZi', () => {
  it('zilele noi primele, ordinea rândurilor păstrată în zi', () => {
    const g = grupeazaPeZi([{ z: '2026-10-13', n: 1 }, { z: '2026-10-14', n: 2 }, { z: '2026-10-13', n: 3 }], (r) => r.z);
    expect(g.map((x) => x.zi)).toEqual(['2026-10-14', '2026-10-13']);
    expect(g[1].randuri.map((r) => r.n)).toEqual([1, 3]);
  });
});
