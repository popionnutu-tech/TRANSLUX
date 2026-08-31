// Redactarea cheilor din textul erorilor. Miza e mare: repo-ul e PUBLIC, iar
// workflow-ul voice-controller face `cat` pe răspunsul cronului în logul GitHub.
// Cazurile de mai jos vin din security review 31.08 — potrivirea exactă singură
// se ocolea prin escapare JSON și prin ecou trunchiat.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { redactSecrets } from './voice/el';

// Toate cele trei chei se salvează și se restaurează: altfel o cheie prezentă în
// mediul mașinii de dezvoltare ar da alt rezultat decât în CI.
const OLD = {
  VOICE_API_KEY: process.env.VOICE_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
};
afterEach(() => { Object.assign(process.env, OLD); });

describe('redactSecrets', () => {
  beforeEach(() => { process.env.VOICE_API_KEY = 'sk_voice_ABCDEF123456'; });

  it('taie cheia rostită dosloven în corpul erorii', () => {
    const s = 'EL PATCH agent: 422 {"input":{"x-voice-api-key":"sk_voice_ABCDEF123456"}}';
    const out = redactSecrets(s);
    expect(out).not.toContain('sk_voice_ABCDEF123456');
    expect(out).toContain('***');
  });

  it('taie și cheia escapată JSON (ghilimele/backslash în cheie)', () => {
    process.env.VOICE_API_KEY = 'ab"cd\\ef12345';
    const s = 'EL PATCH agent: 422 {"input":{"x-voice-api-key":"ab\\"cd\\\\ef12345"}}';
    expect(redactSecrets(s)).not.toContain('cd');
  });

  it('taie ecoul TRUNCHIAT: prefixul cheii nu supraviețuiește', () => {
    const s = 'EL PATCH agent: 422 {"input":{"x-voice-api-key":"sk_voice_ABC...';
    const out = redactSecrets(s);
    expect(out).not.toContain('sk_voice_ABC');
  });

  it('taie și alte chei cunoscute după numele câmpului', () => {
    const s = '{"xi-api-key":"whatever-secret","authorization":"Bearer tok_123"}';
    const out = redactSecrets(s);
    expect(out).not.toContain('whatever-secret');
    expect(out).not.toContain('tok_123');
  });

  it('redactarea se aplică ÎNAINTE de trunchiere — cheia stă după caracterul 200', () => {
    const pad = 'x'.repeat(260);
    const s = `EL PATCH agent: 422 {"detail":"${pad}","x-voice-api-key":"sk_voice_ABCDEF123456"}`;
    expect(redactSecrets(s).slice(0, 200)).not.toContain('sk_voice');
    // Ordinea inversă ar fi lăsat cheia în afara feliei — dar în jurnal ar fi intrat
    // felia, nu textul întreg; testul păzește ordinea din apelanți.
    expect(redactSecrets(s)).not.toContain('sk_voice_ABCDEF123456');
  });

  it('cheie absentă sau prea scurtă: textul rămâne neatins, fără explozie', () => {
    delete process.env.VOICE_API_KEY;
    expect(redactSecrets('mesaj obișnuit fără chei')).toBe('mesaj obișnuit fără chei');
    process.env.VOICE_API_KEY = 'abc';
    expect(redactSecrets('abcdefgh')).toBe('abcdefgh');
  });

  // Fără testele astea, ștergerea unei chei din listă ar trece neobservată.
  it('taie și ELEVENLABS_API_KEY, și CRON_SECRET, nu doar cheia vocii', () => {
    process.env.ELEVENLABS_API_KEY = 'xi_LIVE_KEY_9988776655';
    process.env.CRON_SECRET = 'cron_LIVE_SECRET_4321';
    const s = 'eroare: xi_LIVE_KEY_9988776655 și cron_LIVE_SECRET_4321 în text';
    const out = redactSecrets(s);
    expect(out).not.toContain('xi_LIVE_KEY_9988776655');
    expect(out).not.toContain('cron_LIVE_SECRET_4321');
  });

  it('taie PREFIXUL cheii în forma pydantic «loc», unde numele nu stă lângă valoare', () => {
    // FastAPI pune numele câmpului ca element de listă în `loc`, iar valoarea separat
    // în `input` — trecerea structurală nu are ce prinde, iar ecoul e tăiat la mijloc.
    const s = '{"detail":[{"loc":["body","request_headers","x-voice-api-key"],"input":"sk_voice_ABC';
    expect(redactSecrets(s)).not.toContain('sk_voice_ABC');
  });

  it('nu strică textul util: mesajul de eroare rămâne citibil', () => {
    const s = 'EL PATCH agent: 422 {"detail":[{"loc":["body","turn"],"msg":"field required"}]}';
    expect(redactSecrets(s)).toContain('field required');
  });
});
