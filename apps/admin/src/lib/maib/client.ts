/**
 * Clientul maib Checkout (e-Commerce Checkout API v2) — docs.maibmerchants.md/checkout.
 *
 * Doar fetch, fără dependențe. Token Bearer cu cache în modul (sandbox: 1800 s), reîmprospătat
 * cu 60 s înainte de expirare și o singură dată la 401. Toate răspunsurile se judecă pe HTTP
 * ȘI pe câmpul `ok`; `errors[]` ajunge în MaibError.
 *
 * Env: MAIB_BASE_URL (implicit sandbox), MAIB_CLIENT_ID, MAIB_CLIENT_SECRET.
 * Semnătura callback-ului (MAIB_SIGNATURE_KEY) e în signature.ts.
 *
 * Verificat pe viu 02.10.2026 (ION-188): sandbox-ul întoarce stările cu altă capitalizare decât
 * documentația («Waitingforinit»), de aceea comparațiile de stare se fac cu stareEgala().
 */

import 'server-only';

export const MAIB_SANDBOX_URL = 'https://sandbox.maibmerchants.md';
export const MAIB_PRODUCTION_URL = 'https://api.maibmerchants.md';
// 8 s pe apel: comanda face token + createCheckout în ruta cu maxDuration 30; la 20 s × 2 Vercel ar fi tăiat
// funcția înaintea catch-ului și comanda rămânea revendicată (revizia de cod, 03.10). Sandbox-ul răspunde sub 1 s.
const TIMEOUT_MS = 8_000;
/** Reîmprospătăm tokenul cu atât înainte de expirare. */
const TOKEN_MARGIN_S = 60;

export class MaibError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: Array<{ errorCode?: string; errorMessage?: string }> = [],
  ) {
    super(message);
    this.name = 'MaibError';
  }
}

export type MaibMediu = 'sandbox' | 'prod';

export function maibMediu(): MaibMediu {
  return baseUrl() === MAIB_PRODUCTION_URL ? 'prod' : 'sandbox';
}

function baseUrl(): string {
  return (process.env.MAIB_BASE_URL || MAIB_SANDBOX_URL).replace(/\/+$/, '');
}

function credentiale(): { clientId: string; clientSecret: string } {
  const clientId = process.env.MAIB_CLIENT_ID;
  const clientSecret = process.env.MAIB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new MaibError('MAIB_CLIENT_ID / MAIB_CLIENT_SECRET lipsesc din mediu', 0);
  return { clientId, clientSecret };
}

export function maibConfigurat(): boolean {
  return Boolean(process.env.MAIB_CLIENT_ID && process.env.MAIB_CLIENT_SECRET && process.env.MAIB_SIGNATURE_KEY);
}

/** Stările vin cu capitalizare inconsistentă (sandbox: «Waitingforinit»); comparăm fără ea. */
export function stareEgala(a: string | null | undefined, b: string): boolean {
  return (a ?? '').toLowerCase() === b.toLowerCase();
}

// ---------------------------------------------------------------------------------------------
// Tipuri (doar câmpurile pe care le folosim; restul rămâne în obiectul brut)

export interface MaibApiResponse<T> {
  ok: boolean;
  result?: T;
  errors?: Array<{ errorCode?: string; errorMessage?: string }> | null;
}

export interface MaibCreateCheckoutInput {
  /** În lei, cu două decimale; maib cere > 1,00. */
  amount: number;
  currency?: 'MDL';
  language?: 'ro' | 'ru' | 'en';
  orderId: string;
  /** ≤ 125 caractere. */
  description?: string;
  payer?: { name?: string; email?: string; phone?: string; ip?: string; userAgent?: string };
  callbackUrl: string;
  successUrl: string;
  failUrl: string;
}

export interface MaibCheckoutCreated {
  checkoutId: string;
  checkoutUrl: string;
}

export interface MaibCheckoutPayment {
  paymentId: string;
  executedAt?: string;
  status: string; // Executed | Failed | PartiallyRefunded | Refunded
  amount: number;
  currency: string;
  refundedAmount?: number;
  requestedRefundAmount?: number;
  paymentMethod?: string | null;
  approvalCode?: string | null;
  referenceNumber?: string;
}

export interface MaibCheckout {
  id: string;
  createdAt: string;
  /** WaitingForInit | Initialized | PaymentMethodSelected | Completed | Expired | Abandoned | Cancelled | Failed */
  status: string;
  amount: number;
  currency: string;
  url?: string;
  completedAt?: string | null;
  expiresAt?: string;
  order?: { id?: string | null; description?: string | null } | null;
  payment?: MaibCheckoutPayment | null;
}

export interface MaibPayment {
  id?: string;
  paymentId?: string;
  /** «Date and time when the payment was executed» (docs get-payment-by-id); 560: clasificarea plății târzii. */
  executedAt?: string;
  status: string; // Executed | PartiallyRefunded | Refunded | Failed
  amount: number;
  currency: string;
  refundedAmount?: number;
  requestedRefundAmount?: number;
  isRefundable?: boolean;
  partialRefundAvailable?: boolean;
  refundableAmount?: number;
}

export interface MaibRefundCreated {
  refundId: string;
  status: string; // Created
}

export interface MaibRefund {
  id: string;
  paymentId: string;
  refundType?: string;
  amount: number;
  currency: string;
  refundReason?: string;
  executedAt?: string;
  /** Created | Requested | Accepted | Rejected | Manual */
  status: string;
}

// ---------------------------------------------------------------------------------------------
// Token

let tokenCache: { token: string; tokenType: string; expiraLa: number; cheie: string } | null = null;

async function obtineToken(fortat = false): Promise<string> {
  const { clientId, clientSecret } = credentiale();
  const cheie = `${baseUrl()}|${clientId}`;
  if (!fortat && tokenCache && tokenCache.cheie === cheie && tokenCache.expiraLa > Date.now()) {
    return `${tokenCache.tokenType} ${tokenCache.token}`;
  }
  const res = await fetch(`${baseUrl()}/v2/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as MaibApiResponse<{ accessToken: string; expiresIn: number; tokenType: string }> | null;
  if (!res.ok || !json?.ok || !json.result?.accessToken) {
    throw new MaibError(`maib: token refuzat (HTTP ${res.status})`, res.status, json?.errors ?? []);
  }
  const { accessToken, expiresIn, tokenType } = json.result;
  tokenCache = {
    token: accessToken,
    tokenType: tokenType || 'Bearer',
    expiraLa: Date.now() + Math.max(30, (expiresIn || 300) - TOKEN_MARGIN_S) * 1000,
    cheie,
  };
  return `${tokenCache.tokenType} ${tokenCache.token}`;
}

/** Pentru teste / depanare: uită tokenul. */
export function uitaTokenulMaib(): void {
  tokenCache = null;
}

// ---------------------------------------------------------------------------------------------
// Apelul generic

async function apel<T>(method: 'GET' | 'POST', path: string, body?: unknown, reincercat = false): Promise<T> {
  const auth = await obtineToken();
  // Content-Type doar când trimitem corp: un GET cu «Content-Type: application/json» primește 403 de la
  // sandbox (verificat 02.10.2026).
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: body === undefined
      ? { Authorization: auth, Accept: 'application/json' }
      : { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (res.status === 401 && !reincercat) {
    await obtineToken(true);
    return apel<T>(method, path, body, true);
  }
  const text = await res.text();
  let json: MaibApiResponse<T> | null = null;
  try { json = JSON.parse(text) as MaibApiResponse<T>; } catch { json = null; }
  if (!res.ok || !json || json.ok !== true) {
    const errs = json?.errors ?? [];
    const detaliu = errs.map(e => [e.errorCode, e.errorMessage].filter(Boolean).join(': ')).join('; ');
    throw new MaibError(`maib ${method} ${path}: HTTP ${res.status}${detaliu ? ` — ${detaliu}` : ''}`, res.status, errs);
  }
  return json.result as T;
}

// ---------------------------------------------------------------------------------------------
// Operațiile

/** POST /v2/checkouts — sesiune de plată găzduită; pasagerul e trimis la checkoutUrl. */
export async function createCheckout(input: MaibCreateCheckoutInput): Promise<MaibCheckoutCreated> {
  if (!(input.amount > 1)) throw new MaibError('maib cere o sumă mai mare de 1,00 MDL', 0);
  const body = {
    amount: Number(input.amount.toFixed(2)),
    currency: input.currency ?? 'MDL',
    language: input.language ?? 'ro',
    orderInfo: {
      id: input.orderId,
      description: input.description?.slice(0, 125),
      date: new Date().toISOString(),
    },
    payerInfo: input.payer,
    callbackUrl: input.callbackUrl,
    successUrl: input.successUrl,
    failUrl: input.failUrl,
  };
  return apel<MaibCheckoutCreated>('POST', '/v2/checkouts', body);
}

/** GET /v2/checkouts/{id} — starea sesiunii și plata (dacă există). */
export function getCheckout(checkoutId: string): Promise<MaibCheckout> {
  return apel<MaibCheckout>('GET', `/v2/checkouts/${encodeURIComponent(checkoutId)}`);
}

/**
 * GET /v2/checkouts?orderId=… — sesiunea după comanda noastră. Verificat pe sandbox 02.10.2026 (ION-190, F26):
 * filtrul `orderId` întoarce exact sesiunea; parametrii necunoscuți sunt IGNORAȚI (ar întoarce tot), deci numele
 * trebuie scris exact așa. Folosit de împăcare, când comanda a rămas fără checkout_id după un timeout la creare.
 */
export async function findCheckoutByOrderId(orderId: string): Promise<MaibCheckout | null> {
  const r = await apel<{ items?: MaibCheckout[]; count?: number }>('GET', `/v2/checkouts?orderId=${encodeURIComponent(orderId)}&count=5`);
  const items = r.items ?? [];
  // Siguranță contra ignorării filtrului: păstrăm doar sesiunile cu comanda cerută.
  const ale = items.filter(c => c.order?.id === orderId);
  if (ale.length === 0) return null;
  return ale.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
}

/** POST /v2/checkouts/{id}/cancel — doar sesiuni neplătite. */
export function cancelCheckout(checkoutId: string): Promise<{ checkoutId: string; status: string }> {
  return apel('POST', `/v2/checkouts/${encodeURIComponent(checkoutId)}/cancel`);
}

/** GET /v2/payments/{id} */
export function getPayment(paymentId: string): Promise<MaibPayment> {
  return apel<MaibPayment>('GET', `/v2/payments/${encodeURIComponent(paymentId)}`);
}

/** POST /v2/payments/{payId}/refund — creează refund-ul (status Created); rezultatul final la getRefund. */
export function refundPayment(paymentId: string, amount: number, reason: string): Promise<MaibRefundCreated> {
  if (!(amount > 0)) throw new MaibError('suma refund-ului trebuie să fie pozitivă', 0);
  if (!reason.trim()) throw new MaibError('refund-ul cere un motiv', 0);
  return apel<MaibRefundCreated>('POST', `/v2/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: Number(amount.toFixed(2)),
    reason: reason.trim().slice(0, 500),
  });
}

/** GET /v2/payments/refunds/{id} */
export function getRefund(refundId: string): Promise<MaibRefund> {
  return apel<MaibRefund>('GET', `/v2/payments/refunds/${encodeURIComponent(refundId)}`);
}
