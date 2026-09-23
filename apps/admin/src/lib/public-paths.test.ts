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
    expect(isPublicPath('/api/asistent-site/x')).toBe(false);
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
