import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { cheieLivrareValida, handleLivrare, parseazaCorpLivrare } from './livrare.js';

const CHEIE = 'k'.repeat(64);
const UUID = '0b5e3c9a-1234-4cde-9abc-0123456789ab';

function cerere(metoda: string, url: string, corp: string, auth?: string) {
  const s = new PassThrough() as unknown as Record<string, unknown> & PassThrough;
  Object.assign(s, { method: metoda, url, headers: auth ? { authorization: auth } : {} });
  setImmediate(() => { s.end(corp); });
  return s;
}
function raspuns() {
  const r = { status: 0, corp: '', writeHead(st: number) { r.status = st; return r; }, end(c?: string) { r.corp = c ?? ''; } };
  return r;
}

describe('ION-274: POST /bilete/v1/livreaza', () => {
  it('cheia: doar Bearer exact, ≥ 64 caractere; fără cheie configurată nimic nu trece', () => {
    expect(cheieLivrareValida(`Bearer ${CHEIE}`, CHEIE)).toBe(true);
    expect(cheieLivrareValida(`Bearer ${CHEIE}x`, CHEIE)).toBe(false);
    expect(cheieLivrareValida(undefined, CHEIE)).toBe(false);
    expect(cheieLivrareValida(`Bearer short`, 'short')).toBe(false);
    expect(cheieLivrareValida(`Bearer ${CHEIE}`, '')).toBe(false);
  });
  it('corpul: doar {checkout_id: uuid}, ≤ 4 KB', () => {
    expect(parseazaCorpLivrare(JSON.stringify({ checkout_id: UUID.toUpperCase() }))).toEqual({ checkout_id: UUID });
    expect(parseazaCorpLivrare('{"checkout_id":"x"}')).toBeNull();
    expect(parseazaCorpLivrare('gunoi')).toBeNull();
    expect(parseazaCorpLivrare(JSON.stringify({ checkout_id: UUID, x: 'a'.repeat(5000) }))).toBeNull();
  });
  it('altă cale → nu e a lui (false); GET → 405; cheie greșită → 401 fără a porni jobul; bun → 202 și jobul pornește', async () => {
    const ruleazaAcum = vi.fn();
    const deps = { ruleazaAcum, cheie: CHEIE, jurnal: () => undefined };
    expect(await handleLivrare(cerere('POST', '/altceva', '') as never, raspuns() as never, deps)).toBe(false);
    const r1 = raspuns(); await handleLivrare(cerere('GET', '/bilete/v1/livreaza', '') as never, r1 as never, deps); expect(r1.status).toBe(405);
    const r2 = raspuns(); await handleLivrare(cerere('POST', '/bilete/v1/livreaza', JSON.stringify({ checkout_id: UUID }), 'Bearer gresit') as never, r2 as never, deps); expect(r2.status).toBe(401);
    const r3 = raspuns(); await handleLivrare(cerere('POST', '/bilete/v1/livreaza', 'gunoi', `Bearer ${CHEIE}`) as never, r3 as never, deps); expect(r3.status).toBe(400);
    expect(ruleazaAcum).not.toHaveBeenCalled();
    const r4 = raspuns(); await handleLivrare(cerere('POST', '/bilete/v1/livreaza', JSON.stringify({ checkout_id: UUID }), `Bearer ${CHEIE}`) as never, r4 as never, deps);
    expect(r4.status).toBe(202);
    expect(ruleazaAcum).toHaveBeenCalledTimes(1);
  });
});
