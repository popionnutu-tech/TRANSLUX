import { describe, it, expect } from 'vitest';
import { parseLocation, formatLocation, locationError, normalizeLocation, LOCATION_MAX_LENGTH } from './piese-location';

/* ── parseLocation ── */

describe('parseLocation', () => {
  it('desface toate cele patru niveluri', () => {
    expect(parseLocation('A-12-3-5')).toEqual({ section: 'A', rack: '12', shelf: '3', cell: '5' });
  });

  // Datele scrise înainte de al patrulea nivel trebuie să rămână valide, nu să apară ca stricate.
  it('acceptă etichetele vechi de trei și două niveluri', () => {
    expect(parseLocation('A-2-4')).toEqual({ section: 'A', rack: '2', shelf: '4', cell: '' });
    expect(parseLocation('A-12')).toEqual({ section: 'A', rack: '12', shelf: '', cell: '' });
  });

  it('normalizează majusculele și spațiile din jurul cratimelor', () => {
    expect(parseLocation(' a-12 - 3 ')).toEqual({ section: 'A', rack: '12', shelf: '3', cell: '' });
  });

  it('dă „—" pe primele două niveluri când eticheta lipsește, ca harta să aibă ce desena', () => {
    expect(parseLocation(null)).toEqual({ section: '—', rack: '—', shelf: '', cell: '' });
    expect(parseLocation('')).toEqual({ section: '—', rack: '—', shelf: '', cell: '' });
  });
});

/* ── formatLocation ── */

describe('formatLocation', () => {
  it('scrie adresa pe înțelesul omului', () => {
    expect(formatLocation('A-12-3-5')).toBe('stelaj A, rând 12, poliță 3, celula 5');
  });

  it('sare peste nivelurile lipsă', () => {
    expect(formatLocation('A-12')).toBe('stelaj A, rând 12');
  });

  it('dă „—" pentru eticheta goală', () => {
    expect(formatLocation('')).toBe('—');
    expect(formatLocation(null)).toBe('—');
  });
});

/* ── locationError ── */

describe('locationError', () => {
  it('acceptă formatele valide, de la două la patru niveluri', () => {
    for (const ok of ['A-12-3-5', 'A-2-4', 'A-12', 'B1-07-3-12']) {
      expect(locationError(ok), ok).toBeNull();
    }
  });

  // Eticheta goală = piesă fără loc atribuit încă; obligativitatea o cere apelantul, nu validatorul.
  it('acceptă eticheta goală', () => {
    expect(locationError('')).toBeNull();
    expect(locationError(null)).toBeNull();
    expect(locationError('   ')).toBeNull();
  });

  // Validarea rulează pe forma NORMALIZATĂ — altfel ar respinge exact ce urmează să și salveze.
  it('acceptă litere mici și spații lângă cratime', () => {
    expect(locationError('a-12 - 3')).toBeNull();
  });

  it('respinge eticheta fără cratimă', () => {
    expect(locationError('raft 5')).not.toBeNull();
  });

  // Regresia pe care schimbarea o repară: al cincilea nivel era TĂIAT tăcut, nu refuzat.
  it('respinge al cincilea nivel în loc să-l ignore', () => {
    expect(locationError('A-12-3-5-9')).toMatch(/prea multe niveluri/);
  });

  // Cratima în plus la final are 5 bucăți, dar cauza reală e nivelul gol — mesajul trebuie s-o spună.
  it('raportează nivelul gol înaintea numărului de niveluri', () => {
    expect(locationError('A-12-3-5-')).toMatch(/gol/);
    expect(locationError('A--3')).toMatch(/gol/);
  });

  it('respinge caracterele din afara [A-Z0-9]', () => {
    expect(locationError('A-12-Ș')).not.toBeNull();
    expect(locationError('А-12-3')).not.toBeNull();      // А chirilic
    expect(locationError('A-",foo()')).not.toBeNull();
  });

  it('respinge etichetele peste plafonul de lungime', () => {
    expect(locationError(`${'A'.repeat(LOCATION_MAX_LENGTH)}-1`)).toMatch(/prea lungă/);
  });
});

/* ── normalizeLocation ── */

describe('normalizeLocation', () => {
  it('uniformizează majusculele și spațiile, ca două tastări să dea aceeași celulă pe hartă', () => {
    expect(normalizeLocation('a-12 - 3')).toBe('A-12-3');
    expect(normalizeLocation('A-12-3')).toBe('A-12-3');
  });

  it('întoarce șir gol pentru eticheta absentă', () => {
    expect(normalizeLocation(null)).toBe('');
    expect(normalizeLocation('  ')).toBe('');
  });
});
