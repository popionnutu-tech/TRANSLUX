/**
 * Clientul API-ului din bot (/app/v1/). Token-ul stă în expo-secure-store sub
 * cheia `peron_token` și pleacă ca `Authorization: Bearer <token>`.
 *
 * Erori: orice răspuns `{ ok: false }` devine `ApiError(code, message, status, details)`;
 * lipsa rețelei → `ApiError('OFFLINE')`; 401 pe o rută autentificată șterge token-ul
 * și trimite la login (cu excepția apelurilor din fundal, vezi `keepSessionOn401`).
 */
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import type {
  CleaningPhotoBody,
  CleaningPhotoResponse,
  DayResponse,
  DriverPhotoBody,
  DriverPhotoResponse,
  LinkResponse,
  PresencePing,
  PresenceResponse,
  ReportBody,
  ReportResponse,
  SkipBody,
  SkipResponse,
  VehicleResponse,
} from './types';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const TOKEN_KEY = 'peron_token';
export const MAX_PINGS_PER_REQUEST = 200;

const DEFAULT_TIMEOUT_MS = 30_000;
const PHOTO_TIMEOUT_MS = 90_000;

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 0,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isOffline(): boolean {
    return this.code === 'OFFLINE';
  }
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

// ── Token ─────────────────────────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // nimic de făcut — token-ul lipsea deja
  }
}

/** Șterge token-ul și duce la login. Apelat la 401 și de «Deconectează». */
export async function logout(): Promise<void> {
  await clearToken();
  router.replace('/login');
}

// ── Cererea de bază ───────────────────────────────────────────────────────────

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
  /** Din fundal (ping-uri GPS) nu navigăm la login: 401 rămâne o eroare obișnuită. */
  keepSessionOn401?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS, keepSessionOn401 = false } = opts;
  if (!API_URL) throw new ApiError('NO_API_URL', 'EXPO_PUBLIC_API_URL nu e setat');

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getToken();
    if (!token) {
      if (!keepSessionOn401) router.replace('/login');
      throw new ApiError('UNAUTHORIZED', 'Nu ești conectat', 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/app/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('OFFLINE', 'Fără internet. Încearcă din nou când revine semnalul.');
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError('BAD_RESPONSE', `Răspuns neașteptat de la server (${res.status})`, res.status);
    }
  }
  const obj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

  if (!res.ok || obj.ok !== true) {
    const code = typeof obj.code === 'string' ? obj.code : res.status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR';
    const message = typeof obj.message === 'string' ? obj.message : `Eroare ${res.status}`;
    const { ok: _ok, code: _code, message: _message, ...details } = obj;
    if (res.status === 401 && auth && !keepSessionOn401) {
      await clearToken();
      router.replace('/login');
    }
    throw new ApiError(code, message, res.status, details);
  }

  const { ok: _ok, ...result } = obj;
  return result as T;
}

// ── Rutele ────────────────────────────────────────────────────────────────────

export function link(code: string, deviceLabel: string | null): Promise<LinkResponse> {
  return request<LinkResponse>('auth/link', { method: 'POST', auth: false, body: { code, deviceLabel } });
}

export function getDay(): Promise<DayResponse> {
  return request<DayResponse>('day');
}

export function postReport(body: ReportBody): Promise<ReportResponse> {
  return request<ReportResponse>('report', { method: 'POST', body });
}

/** «N-am fost la cursă»: doar cursa `next`, cu cifra de la șofer (sau absent); fără poze sau GPS. */
export function postSkip(body: SkipBody): Promise<SkipResponse> {
  return request<SkipResponse>('skip', { method: 'POST', body });
}

export function postVehicle(plate: string): Promise<VehicleResponse> {
  return request<VehicleResponse>('vehicle', { method: 'POST', body: { plate } });
}

export function postCleaningPhoto(body: CleaningPhotoBody): Promise<CleaningPhotoResponse> {
  return request<CleaningPhotoResponse>('cleaning-photo', { method: 'POST', body, timeoutMs: PHOTO_TIMEOUT_MS });
}

export function postDriverPhoto(body: DriverPhotoBody): Promise<DriverPhotoResponse> {
  return request<DriverPhotoResponse>('driver-photo', { method: 'POST', body, timeoutMs: PHOTO_TIMEOUT_MS });
}

/** Lot de maximum 200 de ping-uri. `accepted` < trimise e normal (duplicate / în afara ferestrei). */
export function postPresence(pings: PresencePing[]): Promise<PresenceResponse> {
  return request<PresenceResponse>('presence', { method: 'POST', body: { pings }, keepSessionOn401: true });
}
