import { describe, expect, it } from 'vitest';
import { asambleazaComanda, oraSosire, type ComandaRand } from './bilet-asamblare';

const C: ComandaRand = {
  id: 'abcdef12-0000-4000-8000-000000000000', cod: 'a'.repeat(32), status: 'platita', trip_date: '2026-10-06', from_name: 'Edineț', to_name: 'Chișinău',
  departure_at: '2026-10-06T14:20:00+03:00', seats: 2, price_per_seat: '242.00', total: '484', passenger_name: 'Pop Ion', lang: 'ro',
  paid_at: null, cancelled_at: null, crm_route_id: 21, going_north: false, to_stop_order: 370,
  punct_urcare_nume_ro: 'Autogara', punct_urcare_nume_ru: null, punct_urcare_lat: '48.1', punct_urcare_lon: 27.3,
};
const RUTA = { id: 21, dest_from_ro: 'Otaci - Chișinău', dest_from_ru: 'Отаче - Кишинёв', dest_to_ro: 'Chișinău - Otaci', dest_to_ru: 'Кишинёв - Отаче' };

describe('ION-276: asamblarea biletului (pagina biletului și lista clientului)', () => {
  it('ora de sosire pe sensul comenzii, cu zero în față; altfel null', () => {
    expect(oraSosire({ going_north: false }, { hour_from_nord: '7:05', hour_from_chisinau: '20:00' })).toBe('07:05');
    expect(oraSosire({ going_north: true }, { hour_from_nord: '7:05', hour_from_chisinau: '20:00' })).toBe('20:00');
    expect(oraSosire({ going_north: false }, { hour_from_nord: '0:00x', hour_from_chisinau: null })).toBeNull();
    expect(oraSosire({ going_north: false }, null)).toBeNull();
  });
  it('biletele ordonate după nr, cu QR SVG; numărul, prețul, ruta pe sens, punctul de urcare', async () => {
    const r = await asambleazaComanda(C, [
      { nr: 2, loc_nr: 5, cod_qr: 'QR2QR2QR2QR2QR2QR2QR', status: 'valid', urcat_at: null },
      { nr: 1, cod_qr: 'QR1QR1QR1QR1QR1QR1QR', status: 'urcat', urcat_at: '2026-10-06T11:20:00Z' },
    ], RUTA, { hour_from_nord: '17:40', hour_from_chisinau: null });
    expect(r.numar).toBe('ABCDEF12');
    expect(r.price_per_seat).toBe(242);
    expect(r.total).toBe(484);
    expect(r.sosire).toBe('17:40');
    expect(r.ruta).toEqual({ id: 21, nume_ro: 'Otaci - Chișinău', nume_ru: 'Отаче - Кишинёв' });
    expect(r.punct_urcare).toEqual({ nume_ro: 'Autogara', nume_ru: 'Autogara', lat: 48.1, lon: 27.3 });
    // Ion, 10.10.2026: spre Chișinău (din nord) biletul nu are numărul locului.
    expect(r.bilete.map((b) => [b.nr, b.loc_nr])).toEqual([[1, null], [2, null]]);
    expect(r.bilete[0].qr_svg).toMatch(/^<svg/);
  });
  it('fără rută și fără punct → null, nu câmpuri goale', async () => {
    const r = await asambleazaComanda({ ...C, punct_urcare_lat: null }, [], null, null);
    expect(r.ruta).toBeNull();
    expect(r.punct_urcare).toBeNull();
    expect(r.sosire).toBeNull();
  });
});
