import { describe, expect, it, vi } from 'vitest';
import { creeazaCacheNomenclator, nomenclatorGol, type NomenclatorRuta } from './sofer-nomenclator';

const n = (id: number, opriri = 3): NomenclatorRuta => ({
  ruta: { id, dest_from_ro: `R${id} - Chișinău`, dest_to_ro: `Chișinău - R${id}`, time_nord: null, time_chisinau: null },
  opriri: Array.from({ length: opriri }, (_, i) => ({ crm_route_id: id, stop_order: (i + 1) * 10, name_ro: `o${i}`, hour_from_nord: null, hour_from_chisinau: null })),
  coord: new Map(),
});

describe('ION-273: cache-ul nomenclatorului pe rută', () => {
  it('încarcă doar rutele lipsă, o singură dată, cu in(ids); a doua cerere nu mai atinge încărcătorul', async () => {
    const incarca = vi.fn(async (ids: number[]) => new Map(ids.map((id) => [id, n(id, id)])));
    let t = 1_000_000;
    const c = creeazaCacheNomenclator(incarca, 10_000, () => t);
    const a = await c.pentru([7, 21, 7]);
    expect(incarca).toHaveBeenCalledTimes(1);
    expect(incarca).toHaveBeenCalledWith([7, 21]);
    expect(a.get(7)?.opriri).toHaveLength(7);
    expect(a.get(21)?.opriri).toHaveLength(21);
    const b = await c.pentru([21, 30]);
    expect(incarca).toHaveBeenCalledTimes(2);
    expect(incarca).toHaveBeenLastCalledWith([30]);
    expect(b.get(21)?.opriri).toHaveLength(21);
    expect(c.marime()).toBe(3);
    t += 10_001; // expiră
    await c.pentru([7]);
    expect(incarca).toHaveBeenCalledTimes(3);
    expect(incarca).toHaveBeenLastCalledWith([7]);
  });
  it('o rută fără rânduri primește nomenclatorul gol (nu undefined), ca să nu cadă lista', async () => {
    const c = creeazaCacheNomenclator(async () => new Map());
    const r = await c.pentru([99]);
    expect(r.get(99)).toEqual(nomenclatorGol());
  });
  it('numărul de opriri din cache e exact cel dat de încărcător pe rută (nicio trunchiere)', async () => {
    const c = creeazaCacheNomenclator(async (ids) => new Map(ids.map((id) => [id, n(id, 42)])));
    const r = await c.pentru([2]);
    expect(r.get(2)?.opriri).toHaveLength(42);
  });
});
