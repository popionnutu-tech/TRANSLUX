import { describe, it, expect } from 'vitest';
import { isPublicPath, PUBLIC_PREFIXES } from './public-paths';

describe('isPublicPath — căile lăsate de middleware fără sesiune', () => {
  it('/api/version e public exact, nu ca prefix', () => {
    expect(isPublicPath('/api/version')).toBe(true);
    expect(isPublicPath('/api/version-x')).toBe(false);
    expect(isPublicPath('/api/versions')).toBe(false);
    expect(isPublicPath('/api/version/')).toBe(false);
  });

  it('asistentul site-ului e public exact', () => {
    expect(isPublicPath('/api/asistent-site')).toBe(true);
    expect(isPublicPath('/api/asistent-site/pozitie')).toBe(true);
    expect(isPublicPath('/api/asistent-site/acum')).toBe(true);
    expect(isPublicPath('/api/asistent-site/x')).toBe(false);
  });

  it('biletele online (ION-193): comanda e exactă, sub /api/bilete/public/ stau DOAR rutele cunoscute', () => {
    expect(isPublicPath('/api/bilete/comanda')).toBe(true);
    expect(isPublicPath('/api/bilete/comanda/x')).toBe(false);
    expect(isPublicPath('/api/bilete')).toBe(false);
    expect(isPublicPath('/api/bilete/admin')).toBe(false);
    // Lista exhaustivă a rutelor publice de sub prefix — se completează conștient la fiecare rută nouă.
    // ION-194: NU există anulare publică de pe site — returnarea se cere prin bot și o decide AI-ul (Ion, 03.10).
    const subPrefix = ['/api/bilete/public/config', '/api/bilete/public/0123456789abcdef0123456789abcdef'];
    expect(isPublicPath('/api/bilete/public/0123456789abcdef0123456789abcdef/anulare')).toBe(true); // sub prefix, dar ruta nu există
    for (const p of subPrefix) expect(isPublicPath(p)).toBe(true);
  });

  it('callback-ul maib e public exact (banca vine fără cookie), pagina /plati nu', () => {
    expect(isPublicPath('/api/pay/maib/callback')).toBe(true);
    expect(isPublicPath('/api/pay/maib/callback/x')).toBe(false);
    expect(isPublicPath('/api/pay/maib')).toBe(false);
    expect(isPublicPath('/plati')).toBe(false);
  });

  it('prefixele existente rămân publice', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/api/cron/driver-penalties')).toBe(true);
    expect(isPublicPath('/api/extern/camioane')).toBe(true);
    expect(isPublicPath('/mini-app/zadachnik')).toBe(true);
    for (const p of PUBLIC_PREFIXES) expect(isPublicPath(p)).toBe(true);
  });

  it('restul cere sesiune', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/lde/x')).toBe(false);
    expect(isPublicPath('/api/lde/camioane')).toBe(false);
    expect(isPublicPath('/grafic')).toBe(false);
    expect(isPublicPath('/api/atribuiri')).toBe(false); // fără slash final nu e sub prefixul `/api/atribuiri/`
  });
});
