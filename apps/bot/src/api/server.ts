/**
 * API-ul aplicației Android de peron (spec docs/specs/peron-app-android.md).
 *
 * Trăiește pe serverul HTTP al botului (index.ts), sub prefixul /app/v1/, ca să
 * refolosească toată logica de raportare din services/db.ts și efectele secundare
 * (loading board, digest, sarcini reclamă). Router mic peste `http`, fără framework:
 * corpul e JSON (limită 8 MB), răspunsul e JSON — `{ ok: true, ... }` sau
 * `{ ok: false, code, message }`.
 *
 * `handleAppApi` întoarce `false` când cererea nu e pentru API (index.ts merge mai
 * departe cu webhook-ul / health check-ul).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { ApiError, badRequest } from './errors.js';
import { authenticate, linkWithCode, type AppUser } from './auth.js';
import { getDay } from './day.js';
import { postReport } from './report.js';
import { postVehicle } from './vehicle.js';

export const API_PREFIX = '/app/v1/';
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface ApiContext {
  req: IncomingMessage;
  method: string;
  path: string; // fără prefix, fără query: 'auth/link', 'day'
  body: unknown; // JSON parsat (null la GET / corp gol)
  user: AppUser | null; // setat pe rutele autentificate
}

export type ApiHandler = (ctx: ApiContext) => Promise<object>;

interface Route {
  method: 'GET' | 'POST';
  path: string;
  auth: boolean;
  handler: ApiHandler;
}

// Rutele se adaugă aici (S04: cleaning-photo, driver-photo;
// S05: presence). Handler-ul întoarce câmpurile care se lipesc peste `{ ok: true }`.
const routes: Route[] = [
  {
    method: 'POST',
    path: 'auth/link',
    auth: false,
    handler: async ({ body }) => {
      const b = asObject(body);
      const code = typeof b.code === 'string' ? b.code.trim() : '';
      const deviceLabel = typeof b.deviceLabel === 'string' ? b.deviceLabel.trim().slice(0, 120) : null;
      if (!code) throw badRequest('Lipsește codul');
      const linked = await linkWithCode(code, deviceLabel || null);
      return { ...linked };
    },
  },
  {
    method: 'GET',
    path: 'day',
    auth: true,
    handler: async ({ user }) => getDay(user!),
  },
  {
    method: 'POST',
    path: 'report',
    auth: true,
    handler: async ({ user, body }) => postReport(user!, body),
  },
  {
    method: 'POST',
    path: 'vehicle',
    auth: true,
    handler: async ({ body }) => postVehicle(body),
  },
];

export function findRoute(method: string, path: string): Route | 'method' | null {
  const samePath = routes.filter((r) => r.path === path);
  if (samePath.length === 0) return null;
  return samePath.find((r) => r.method === method) ?? 'method';
}

/** Taie prefixul și query-ul: '/app/v1/day?x=1' → 'day'. null dacă nu e sub prefix. */
export function apiPath(url: string | undefined): string | null {
  if (!url || !url.startsWith(API_PREFIX)) return null;
  const q = url.indexOf('?');
  const raw = (q >= 0 ? url.slice(0, q) : url).slice(API_PREFIX.length);
  return raw.replace(/\/+$/, '');
}

export async function handleAppApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = apiPath(req.url);
  if (path === null) return false;

  const method = (req.method || 'GET').toUpperCase();
  try {
    const route = findRoute(method, path);
    if (route === null) throw new ApiError(404, 'NOT_FOUND', `Nu există ${method} /app/v1/${path}`);
    if (route === 'method') throw new ApiError(405, 'METHOD_NOT_ALLOWED', `Metoda ${method} nu e permisă`);

    const user = route.auth ? await authenticate(req) : null;
    const body = method === 'POST' ? await readJsonBody(req) : null;
    const result = await route.handler({ req, method, path, body, user });
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, { ok: false, code: err.code, message: err.message, ...(err.details ?? {}) });
    } else {
      console.error(`[app-api] ${method} /app/v1/${path} a picat:`, err);
      sendJson(res, 500, { ok: false, code: 'INTERNAL', message: 'Eroare internă, încearcă din nou' });
    }
  }
  return true;
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return;
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

/** Citește corpul ca JSON. Peste MAX_BODY_BYTES → 413; JSON stricat → 400. */
export function readJsonBody(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', `Corpul depășește ${Math.round(limit / 1024 / 1024)} MB`));
      req.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const fail = (e: Error) => {
      if (done) return;
      done = true;
      reject(e);
    };
    req.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        fail(new ApiError(413, 'PAYLOAD_TOO_LARGE', `Corpul depășește ${Math.round(limit / 1024 / 1024)} MB`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', (e) => fail(e));
    req.on('end', () => {
      if (done) return;
      done = true;
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(badRequest('Corpul nu e JSON valid', 'BAD_JSON'));
      }
    });
  });
}

export function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Corpul trebuie să fie un obiect JSON');
  return body as Record<string, unknown>;
}
