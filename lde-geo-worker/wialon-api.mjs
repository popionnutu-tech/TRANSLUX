// ============================================================================
// Client minimal Wialon Remote API (Wialon Hosting, hst-api.wialon.com).
// Platforma GPS = Wialon white-label (global.gpsauto.md → backend hst-api).
// Folosit de proba wialon-probe.mjs și (etapa 2) de gps-worker pentru migrarea
// de pe citirea directă a BD tracker pe API-ul oficial (decizie Ion 26.06).
// ============================================================================

const HOST = process.env.WIALON_HOST || 'https://hst-api.wialon.com';

async function call(svc, params, sid) {
  const body = new URLSearchParams({ svc, params: JSON.stringify(params) });
  if (sid) body.set('sid', sid);
  const r = await fetch(`${HOST}/wialon/ajax.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  if (j && j.error !== undefined && j.error !== 0) {
    throw new Error(`Wialon ${svc}: error ${j.error}${j.reason ? ` (${j.reason})` : ''}`);
  }
  return j;
}

/** Login cu token → { sid, user } */
export async function login(token) {
  const j = await call('token/login', { token });
  return { sid: j.eid, user: j.user?.nm };
}

/** Toate unitățile (mașinile): [{ id, name }] — name = de regulă plăcuța. */
export async function listUnits(sid) {
  const j = await call('core/search_items', {
    spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
    force: 1, flags: 1, from: 0, to: 0,
  }, sid);
  return (j.items || []).map(u => ({ id: u.id, name: u.nm }));
}

/** Mesajele (pozițiile GPS) unei unități pe interval [fromUnix, toUnix].
 *  Întoarce [{ t, lat, lon, speed }] — speed în km/h (Wialon o dă direct în km/h). */
export async function loadTrack(sid, itemId, fromUnix, toUnix) {
  const j = await call('messages/load_interval', {
    itemId, timeFrom: fromUnix, timeTo: toUnix,
    flags: 1, flagsMask: 65281, loadCount: 0xffffffff,
  }, sid);
  const msgs = (j.messages || [])
    .filter(m => m.pos)
    .map(m => ({ t: m.t, lat: m.pos.y, lon: m.pos.x, speed: m.pos.s ?? 0 }));
  await call('messages/unload', {}, sid).catch(() => {}); // eliberează bufferul sesiunii
  return msgs;
}
