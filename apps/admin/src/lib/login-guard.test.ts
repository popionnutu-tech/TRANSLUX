import { describe, it, expect } from 'vitest';
import { greseliDupaUltimaReusita, greseliInFereastra, reteaDin, sesiuneValida } from './login-guard';

const ACUM = Date.parse('2026-09-28T12:00:00Z');
const la = (minInUrma: number) => new Date(ACUM - minInUrma * 60_000).toISOString();

describe('greseliDupaUltimaReusita', () => {
  it('numără greșelile din ultimele 15 min', () => {
    const ev = [1, 2, 3, 4, 5].map(m => ({ created_at: la(m), ok: false, motiv: 'parola' }));
    expect(greseliDupaUltimaReusita(ev, ACUM)).toBe(5);
  });
  it('se oprește la ultima logare reușită', () => {
    const ev = [
      { created_at: la(1), ok: false, motiv: 'parola' },
      { created_at: la(2), ok: true, motiv: 'ok' },
      ...[3, 4, 5, 6].map(m => ({ created_at: la(m), ok: false, motiv: 'parola' })),
    ];
    expect(greseliDupaUltimaReusita(ev, ACUM)).toBe(1);
  });
  it('nu numără încercările deja blocate și nici pe cele mai vechi de 15 min', () => {
    const ev = [
      { created_at: la(1), ok: false, motiv: 'blocat_email' },
      { created_at: la(2), ok: false, motiv: 'parola' },
      { created_at: la(16), ok: false, motiv: 'parola' },
    ];
    expect(greseliDupaUltimaReusita(ev, ACUM)).toBe(1);
  });
});

describe('greseliInFereastra', () => {
  it('ignoră reușitele și blocările', () => {
    const ev = [
      { created_at: la(1), ok: false, motiv: 'necunoscut' },
      { created_at: la(1), ok: true, motiv: 'ok' },
      { created_at: la(1), ok: false, motiv: 'blocat_ip' },
    ];
    expect(greseliInFereastra(ev, ACUM)).toBe(1);
  });
});

describe('reteaDin', () => {
  it('IPv4 → /24', () => expect(reteaDin('89.28.51.207')).toBe('89.28.51.0/24'));
  it('IPv4 mapat în IPv6', () => expect(reteaDin('::ffff:10.1.2.3')).toBe('10.1.2.0/24'));
  it('IPv6 scurtat → /48', () => expect(reteaDin('2a02:2f0e:5a1::1')).toBe('2a02:2f0e:5a1::/48'));
  it('IPv6 complet', () => expect(reteaDin('2001:0db8:0001:0002:0:0:0:1')).toBe('2001:db8:1::/48'));
  it('gunoi → null', () => {
    expect(reteaDin('nu-e-ip')).toBeNull();
    expect(reteaDin(null)).toBeNull();
  });
});

describe('sesiuneValida', () => {
  it('token fără sv merge cât contul are versiunea 0', () => {
    expect(sesiuneValida(undefined, { active: true, session_version: 0 })).toBe(true);
    expect(sesiuneValida(undefined, { active: true, session_version: 1 })).toBe(false);
  });
  it('contul dezactivat sau lipsă cade', () => {
    expect(sesiuneValida(3, { active: false, session_version: 3 })).toBe(false);
    expect(sesiuneValida(3, null)).toBe(false);
  });
  it('versiune egală trece', () => expect(sesiuneValida(2, { active: true, session_version: 2 })).toBe(true));
});
