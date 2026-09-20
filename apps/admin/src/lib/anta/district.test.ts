import { describe, it, expect } from 'vitest';
import { LocalityIndex, resolveDistricts, parseLocalities } from './district';
import { foldName, splitPrefix, cleanOperator, antaTime, cleanTime } from './names';

const idx = new LocalityIndex(parseLocalities(`
# name|district|lat|lon
Chișinău|mun. Chișinău|47.02278|28.83528
Briceni|Briceni|48.36278|27.08500
Lipcani|Briceni|48.26528|26.80389
Briceni|Dondușeni|48.35722|27.70361
Dondușeni|Dondușeni|48.22444|27.58528
Moșana|Dondușeni|48.32333|27.68917
Sauca|Ocnița|48.37750|27.72556
Otaci|Ocnița|48.43000|27.79389
Edineț|Edineț|48.16806|27.30500
Chetrosu|Anenii Noi|46.91500|29.05194
Chetrosu|Drochia|48.06972|27.90167
Puhoi|Ialoveni|46.78583|28.77806
Căinari|Căușeni|46.67889|29.04611
Bălți|mun. Bălți|47.76111|27.91667
Pelinia|Drochia|47.87583|27.83139
Drochia|Drochia|48.11389|27.80806
Costești|Rîșcani|47.85833|27.25861
Costești|Ialoveni|46.86778|28.80222
Costești|Hîncești|46.87333|28.20667
Hîncești|Hîncești|46.82583|28.59361
Sofia|Drochia|47.94500|27.86306
Sofia|Hîncești|46.84111|28.38028
Fără Coordonate|Orhei||
Fără Coordonate|Telenești||
Orhei|Orhei|47.38306|28.82306
`));

describe('foldName / splitPrefix — numele ANTA fără diacritice și cu prefix', () => {
  it('compară Chișinău cu Chisinau și taie parantezele', () => {
    expect(foldName('Chișinău')).toBe('chisinau');
    expect(foldName('or. Chisinau')).toBe('or chisinau');
    expect(foldName('Orhei (Vile)')).toBe('orhei');
    expect(foldName('Slobozia-Șirăuți')).toBe('slobozia sirauti');
  });
  it('separă prefixul de tip', () => {
    expect(splitPrefix('or. Briceni')).toEqual({ ty: 'or', name: 'Briceni' });
    expect(splitPrefix('s. Briceni')).toEqual({ ty: 's', name: 'Briceni' });
    expect(splitPrefix('Bender')).toEqual({ ty: '', name: 'Bender' });
  });
  it('curăță firma și orele', () => {
    expect(cleanOperator('IURTOL-TRANS S.R.L.,&#9; S.C. ODOGRAF S.R.L.')).toBe('IURTOL-TRANS S.R.L., S.C. ODOGRAF S.R.L.');
    expect(cleanTime('0:00')).toBeNull();
    expect(cleanTime(' 13:46 ')).toBe('13:46');
    expect(antaTime('06:55')).toBe('6:55');
    expect(antaTime('17:50')).toBe('17:50');
  });
});

describe('resolveDistricts — raionul opririlor pe cursă', () => {
  it('Briceni oraș e r. Briceni, Briceni sat e r. Dondușeni', () => {
    expect(resolveDistricts(['or. Chisinau', 'or. Edinet', 'or. Briceni', 'or. Lipcani'], idx))
      .toEqual(['mun. Chișinău', 'Edineț', 'Briceni', 'Briceni']);
    expect(resolveDistricts(['or. Donduseni', 's. Mosana', 's. Briceni', 's. Sauca', 'or. Otaci'], idx))
      .toEqual(['Dondușeni', 'Dondușeni', 'Dondușeni', 'Ocnița', 'Ocnița']);
  });

  it('Chetrosu se alege după vecinii de pe cursă', () => {
    expect(resolveDistricts(['or. Chisinau', 's. Chetrosu', 's. Puhoi', 'or. Cainari'], idx)[1]).toBe('Anenii Noi');
    expect(resolveDistricts(['or. Balti', 's. Pelinia', 's. Chetrosu', 'or. Drochia'], idx)[2]).toBe('Drochia');
  });

  it('Costești pe Chișinău–Hîncești e Ialoveni; Sofia lângă Drochia e Drochia', () => {
    expect(resolveDistricts(['or. Chisinau', 's. Costesti', 'or. Hincesti'], idx)[1]).toBe('Ialoveni');
    expect(resolveDistricts(['or. Balti', 's. Sofia', 'or. Drochia'], idx)[1]).toBe('Drochia');
  });

  it('«or. Soroca (intersecție)» nu e orașul Soroca: rămâne fără raion, un singur punct', () => {
    expect(resolveDistricts(['or. Chisinau', 'or. Orhei', 'or. Soroca (intersecție)', 'or. Balti'], idx))
      .toEqual(['mun. Chișinău', 'Orhei', null, 'mun. Bălți']);
    expect(resolveDistricts(['or. Balti', 's. Intersectia Riscani', 'or. Edinet'], idx)).toEqual(['mun. Bălți', null, 'Edineț']);
  });

  it('fără coordonate ia raionul vecinului; necunoscut rămâne null', () => {
    expect(resolveDistricts(['or. Orhei', 's. Fara Coordonate'], idx)).toEqual(['Orhei', 'Orhei']);
    expect(resolveDistricts(['or. Chisinau', 's. Inexistent'], idx)).toEqual(['mun. Chișinău', null]);
  });
});
