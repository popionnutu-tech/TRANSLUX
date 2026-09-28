// Starea contului din bază pentru verificarea sesiunii (ION-126, migr. 428). Folosit de middleware
// (runtime edge — de aceea fetch direct pe PostgREST, fără supabase-js) și de verifySession.
//
// Cache în memorie pe instanță, 30 s: middleware-ul rulează la fiecare cerere, iar o interogare
// de fiecare dată ar încetini tot panoul. Consecința: o sesiune închisă mai merge cel mult 30 s
// pe instanțele care au contul în cache.

export interface AccountState {
  active: boolean;
  role: string;
  session_version: number;
}

const TTL_MS = 30_000;
// Dacă baza nu răspunde, mai folosim o valoare veche încă 5 min, ca o sughițare a Supabase
// să nu delogheze pe toată lumea. Fără nicio valoare în cache — sesiunea e respinsă.
const TTL_REZERVA_MS = 5 * 60_000;
const cache = new Map<string, { at: number; v: AccountState | null }>();

export function forgetAccountState(id: string): void {
  cache.delete(id);
}

/** null = contul nu există (sau baza nu răspunde și n-avem nimic în cache). */
export async function accountState(id: string): Promise<AccountState | null> {
  const acum = Date.now();
  const c = cache.get(id);
  if (c && acum - c.at < TTL_MS) return c.v;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key || !/^[0-9a-f-]{36}$/i.test(id)) return null;

  try {
    const r = await fetch(
      `${url}/rest/v1/admin_accounts?id=eq.${id}&select=active,role,session_version`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(3000) },
    );
    if (!r.ok) throw new Error(`PostgREST ${r.status}`);
    const rows = (await r.json()) as AccountState[];
    const v = rows[0] ?? null;
    cache.set(id, { at: acum, v });
    return v;
  } catch (err) {
    console.error('[account-state]', err);
    if (c && acum - c.at < TTL_REZERVA_MS) return c.v;
    return null;
  }
}
