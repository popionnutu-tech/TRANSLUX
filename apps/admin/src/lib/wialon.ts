// Client Wialon minimal pentru admin: DOAR pozițiile live ale flotei (harta din
// dispecerat). Track-urile și km-ii rămân la workerul de noapte — aici nu se
// calculează nimic, ca să nu apară o a doua sursă de adevăr pentru kilometraj.
// Portat din lde-geo-worker/wialon-api.mjs, cu aceeași mapare a plăcuței.
const HOST = process.env.WIALON_HOST || 'https://hst-api.wialon.com';

type WialonUnit = {
  id: number;
  nm: string;
  pos?: { y: number; x: number; s?: number; t?: number };
};

async function call(svc: string, params: unknown, sid?: string): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ svc, params: JSON.stringify(params) });
  if (sid) body.set('sid', sid);
  const r = await fetch(`${HOST}/wialon/ajax.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(12000),
  });
  const j = (await r.json()) as Record<string, unknown>;
  if (j && j.error !== undefined && j.error !== 0) {
    throw new Error(`Wialon ${svc}: error ${j.error}`);
  }
  return j;
}

// Sesiunea Wialon ține ~5 min de inactivitate; o păstrăm în memoria instanței ca
// să nu facem login la fiecare refresh de 60s al hărții.
let sesiune: { sid: string; la: number } | null = null;
const SESIUNE_MS = 4 * 60 * 1000;

async function sid(): Promise<string> {
  const token = process.env.WIALON_TOKEN;
  if (!token) throw new Error('WIALON_TOKEN lipsește');
  if (sesiune && Date.now() - sesiune.la < SESIUNE_MS) return sesiune.sid;
  const j = await call('token/login', { token });
  const nou = j.eid as string;
  sesiune = { sid: nou, la: Date.now() };
  return nou;
}

/** Numele unității Wialon → plăcuță normalizată («ACTROS ANT 316 (…)» → ANT316).
 *  Aceeași regulă ca în wialon-worker.mjs — dacă se schimbă acolo, se schimbă și aici. */
export function placaDinNume(nume: string): string | null {
  const m = nume.match(/([A-Z]{3})\s?(\d{3})/);
  return m ? `${m[1]}${m[2]}` : null;
}

export type PozitieLive = { plate: string; lat: number; lng: number; speed: number; at: string };

// Instantaneu comun: N dispeceri cu tabloul deschis nu trebuie să însemne N
// interogări ale flotei la Wialon (cota lui e resursă externă, fără rezervă
// măsurabilă). TTL 45s < refresh-ul de 60s din client, deci fiecare ciclu ia
// date proaspete, dar cererile paralele se lipesc de aceeași promisiune.
let instantaneu: { la: number; date: PozitieLive[] } | null = null;
let inZbor: Promise<PozitieLive[]> | null = null;
const TTL_MS = 45_000;

export async function pozitiiLiveCached(): Promise<PozitieLive[]> {
  if (instantaneu && Date.now() - instantaneu.la < TTL_MS) return instantaneu.date;
  if (!inZbor) {
    inZbor = pozitiiLive()
      .then((d) => { instantaneu = { la: Date.now(), date: d }; return d; })
      .finally(() => { inZbor = null; });
  }
  return inZbor;
}

/** Pozițiile curente ale tuturor unităților. Flags 1|1024 = nume + ultima poziție. */
export async function pozitiiLive(): Promise<PozitieLive[]> {
  const s = await sid();
  const j = await call('core/search_items', {
    spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
    force: 1, flags: 1 | 1024, from: 0, to: 0,
  }, s);
  const items = (j.items ?? []) as WialonUnit[];
  const out: PozitieLive[] = [];
  for (const u of items) {
    if (!u.pos) continue;
    const plate = placaDinNume(u.nm ?? '');
    if (!plate) continue;
    out.push({
      plate,
      lat: u.pos.y,
      lng: u.pos.x,
      speed: u.pos.s ?? 0,
      at: new Date((u.pos.t ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    });
  }
  return out;
}
