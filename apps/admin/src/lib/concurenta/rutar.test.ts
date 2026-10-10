import { describe, expect, it } from 'vitest';
import { caiPerechi, diferente, parseOrar, parsePereche, rezumat, type RutarStare } from './rutar';

// HTML-ul Next.js pune datele în self.__next_f.push([1,"<șir JSON>"]) — construim la fel.
const html = (flux: string) => `<script>self.__next_f.push([1,${JSON.stringify(flux)}])</script>`;

const ruta = (cod: string, de: [string, string, string], spre: [string, string, string], pret = '150', zile = [1, 2, 3, 4, 5, 6, 7]) => ({
  id: `id-${cod}`, name: `${de[0]} - ${spre[0]}`, referenceCode: cod, daysOfWeek: zile, durationMinutes: 120, distanceKm: 133,
  from: { name: 'Gara', cityName: de[0], citySlug: `moldova/${de[1]}`, time: de[2], dayOffset: 0 },
  to: { name: 'Autogara', cityName: spre[0], citySlug: `moldova/${spre[1]}`, time: spre[2], dayOffset: 0 },
  intermediateStopsCount: 1, priceFrom: [{ currency: 'MDL', amount: pret }], coverImageUrl: null,
});

const cursaZi = (ora: string, pret: string, peLaSofer = false) => ({
  id: `vt1_x_20261010_${ora.replace(':', '')}00`, routeId: 'r',
  from: { cityName: 'Chișinău', citySlug: 'moldova/chisinau', time: ora },
  to: { cityName: 'Orhei', citySlug: 'moldova/orhei', time: '12:00' },
  prices: [{ currency: 'MDL', amount: pret }], paymentMethods: ['online'], payOnBoard: { available: peLaSofer },
});

describe('parsarea rutar.md', () => {
  it('citește rutele din /schedule, cu text care conține acolade și ghilimele', () => {
    const flux = `3f:["$","div",null,{"children":"{nu e obiect} \\"citat\\""}]\n4a:${JSON.stringify({ routes: [
      ruta('1070', ['Chișinău', 'chisinau', '06:10'], ['Bălți', 'balti', '08:10']),
      ruta('1097', ['Bălți', 'balti', '07:00'], ['Chișinău', 'chisinau', '09:00'], '140', [1, 2, 3, 4, 5]),
    ] })}`;
    const curse = parseOrar(html(flux));
    expect(curse.map((c) => [c.cheie, c.pret, c.zile.length])).toEqual([
      ['chisinau>balti 06:10', 150, 7],
      ['balti>chisinau 07:00', 140, 5],
    ]);
  });

  it('citește prețul pe tronson și plata din pagina de pereche', () => {
    const flux = `5:${JSON.stringify({ entries: [{ trip: cursaZi('11:00', '50') }, { trip: cursaZi('11:29', '55') }] })}`;
    expect(parsePereche(html(flux))).toEqual({
      cheie: 'chisinau>orhei', de: 'Chișinău', spre: 'Orhei', curse: 2, pretMin: 50, pretMax: 55, laSofer: false,
    });
    expect(parsePereche(html('nimic'))).toBeNull();
  });

  it('ia doar perechile românești din sitemap', () => {
    const xml = ['/', '/ru', '/about', '/moldova-balti', '/moldova-chisinau/moldova-orhei', '/ru/moldova-chisinau/moldova-orhei', '/en/moldova-balti/moldova-chisinau']
      .map((c) => `<loc>https://rutar.md${c}</loc>`).join('');
    expect(caiPerechi(xml)).toEqual(['/moldova-chisinau/moldova-orhei']);
  });
});

describe('diferența dintre zile', () => {
  const cursa = (ora: string, pret = 150) => ({
    cheie: `chisinau>balti ${ora}`, cod: ora, de: 'Chișinău', spre: 'Bălți', ora, sosire: '', zile: [1, 2, 3, 4, 5, 6, 7], pret, km: 133,
  });
  const pereche = (pret: number, laSofer = false) => ({ cheie: 'chisinau>balti', de: 'Chișinău', spre: 'Bălți', curse: 10, pretMin: pret, pretMax: pret, laSofer });
  const stare = (ore: string[], pret: number, laSofer = false): RutarStare => ({
    la: '', curse: Object.fromEntries(ore.map((o) => [`chisinau>balti ${o}`, cursa(o, pret)])), perechi: { 'chisinau>balti': pereche(pret, laSofer) },
  });
  const noi = () => 156;

  it('tace când nu s-a schimbat nimic', () => {
    expect(diferente(stare(['06:10', '06:39'], 150), stare(['06:10', '06:39'], 150), noi)).toEqual([]);
  });

  it('arată curse noi, scoase, prețul nou și prețul nostru', () => {
    const [txt] = diferente(stare(['06:10', '06:39'], 150), stare(['06:10', '05:40'], 140), noi);
    expect(txt).toContain('➕ 1 curse noi: 05:40');
    expect(txt).toContain('➖ 1 curse scoase: 06:39');
    expect(txt).toContain('150 lei la achiziție online → 140 lei la achiziție online');
    expect(txt).toContain('noi: 156 lei (cu 16 mai scump)');
  });

  it('semnalează perechea nouă și plata la șofer', () => {
    const ieri = stare(['06:10'], 150);
    const azi = stare(['06:10'], 150, true);
    azi.perechi['chisinau>orhei'] = { cheie: 'chisinau>orhei', de: 'Chișinău', spre: 'Orhei', curse: 5, pretMin: 50, pretMax: 50, laSofer: false };
    const txt = diferente(ieri, azi, (k) => (k === 'chisinau>orhei' ? 56 : 156)).join('\n');
    expect(txt).toContain('acum se poate plăti și la șofer');
    expect(txt).toContain('🆕 pereche nouă: 50 lei la achiziție online');
    expect(txt).toContain('noi: 56 lei');
  });

  it('rezumatul primului rulaj', () => {
    expect(rezumat(stare(['06:10', '20:11'], 150), () => null)[0])
      .toBe('<b>Chișinău → Bălți</b>: 2 curse (06:10–20:11), 150 lei la achiziție online · noi nu avem perechea');
  });
});
