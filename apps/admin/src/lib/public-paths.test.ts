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
    expect(isPublicPath('/api/asistent-site/forme')).toBe(true);
    expect(isPublicPath('/api/asistent-site/x')).toBe(false);
  });

  it('biletele online (ION-193): comanda e exactă, sub /api/bilete/public/ stau DOAR rutele cunoscute', () => {
    expect(isPublicPath('/api/bilete/comanda')).toBe(true);
    expect(isPublicPath('/api/bilete/comanda/x')).toBe(false);
    expect(isPublicPath('/api/bilete')).toBe(false);
    expect(isPublicPath('/api/bilete/admin')).toBe(false);
    // Lista exhaustivă a rutelor publice de sub prefix — se completează conștient la fiecare rută nouă.
    // ION-194: NU există anulare publică de pe site — returnarea se cere prin bot și o decide AI-ul (Ion, 03.10).
    // ION-198: punctele de urcare ale unei localități (date publice).
    // ION-239: harta locurilor unei curse (ocupate/rezervate, fără date personale).
    // ION-248: imaginea PNG a biletului pentru chatul Telegram (același secret ca pagina).
    const subPrefix = ['/api/bilete/public/config', '/api/bilete/public/puncte', '/api/bilete/public/locuri', '/api/bilete/public/0123456789abcdef0123456789abcdef', '/api/bilete/public/0123456789abcdef0123456789abcdef/imagine'];
    expect(isPublicPath('/api/bilete/public/0123456789abcdef0123456789abcdef/anulare')).toBe(true); // sub prefix, dar ruta nu există
    for (const p of subPrefix) expect(isPublicPath(p)).toBe(true);
    // ION-244: returnarea din bot — exacte, apărate de BILETE_BOT_API_KEY; nimic altceva sub /api/bilete/retur/.
    for (const p of ['/api/bilete/retur/bilete', '/api/bilete/retur/oferta', '/api/bilete/retur/confirma', '/api/bilete/retur/stare', '/api/bilete/retur/escaladeaza']) {
      expect(isPublicPath(p)).toBe(true);
    }
    expect(isPublicPath('/api/bilete/retur')).toBe(false);
    expect(isPublicPath('/api/bilete/retur/admin')).toBe(false);
  });

  it('promoțiile Bălți ⇄ Chișinău (544): DOAR /api/bilete/pret și /api/bilete/student/verifica, exacte', () => {
    expect(isPublicPath('/api/bilete/pret')).toBe(true);
    expect(isPublicPath('/api/bilete/pret/x')).toBe(false);
    expect(isPublicPath('/api/bilete/student/verifica')).toBe(true);
    expect(isPublicPath('/api/bilete/student')).toBe(false);
    expect(isPublicPath('/api/bilete/student/poze')).toBe(false);
    expect(isPublicPath('/api/bilete/student/verifica/x')).toBe(false);
  });

  it('plângerea din bot (ION-252): DOAR /api/bilete/plangere, exact', () => {
    expect(isPublicPath('/api/bilete/plangere')).toBe(true);
    expect(isPublicPath('/api/bilete/plangere/')).toBe(false);
    expect(isPublicPath('/api/bilete/plangere/x')).toBe(false);
    expect(isPublicPath('/api/bilete/plangeri')).toBe(false);
    expect(isPublicPath('/api/bilete/plangere-admin')).toBe(false);
  });

  it('biletele clientului din mini app-ul Telegram (ION-249): DOAR /api/bilete/client/bilete, exact', () => {
    expect(isPublicPath('/api/bilete/client/bilete')).toBe(true);
    expect(isPublicPath('/api/bilete/client/bilete/')).toBe(false);
    expect(isPublicPath('/api/bilete/client/bilete/x')).toBe(false);
    expect(isPublicPath('/api/bilete/client')).toBe(false);
    expect(isPublicPath('/api/bilete/client/admin')).toBe(false);
  });

  it('API-ul mini app-ului șoferului (ION-239): sub /api/bilete-sofer/ stau DOAR /azi și /scan, apărate prin initData', () => {
    for (const p of ['/api/bilete-sofer/azi', '/api/bilete-sofer/scan']) expect(isPublicPath(p)).toBe(true);
    expect(isPublicPath('/api/bilete-sofer')).toBe(false); // fără slash final nu e sub prefix
    expect(isPublicPath('/api/bilete-soferi/azi')).toBe(false);
    expect(isPublicPath('/bilete-sofer/azi')).toBe(false);
  });

  it('callback-ul maib e public exact (banca vine fără cookie), pagina /plati nu', () => {
    expect(isPublicPath('/api/pay/maib/callback')).toBe(true);
    expect(isPublicPath('/api/pay/maib/callback/x')).toBe(false);
    expect(isPublicPath('/api/resend/webhook')).toBe(true);
    expect(isPublicPath('/api/resend/webhook/x')).toBe(false);
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
