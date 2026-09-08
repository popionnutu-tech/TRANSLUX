/**
 * Serverul HTTP al testelor cap-coadă: `handleAppApi` montat exact ca în index.ts,
 * pe 127.0.0.1 și port 0 (liber), cereri cu `fetch`. Așa testele trec prin router,
 * autentificare, citirea corpului și codurile de eroare reale — nu prin apelul
 * direct al handler-elor.
 *
 *   const srv = await startApi();
 *   const { status, body } = await srv.api('GET', 'day', undefined, token);
 *   await srv.stop();
 *
 * Nu are nicio dependență de mock-uri: le montează fișierul de test (vezi mocks.ts).
 */
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { handleAppApi, sendJson } from '../api/server.js';

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export interface TestApi {
  baseUrl: string;
  /**
   * `path` fără prefix ('day', 'auth/link') → `/app/v1/<path>`; cu '/' în față se ia
   * literal (pentru rute din afara API-ului). `body` se serializează ca JSON.
   */
  api<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, token?: string | null): Promise<ApiResponse<T>>;
  stop(): Promise<void>;
}

export async function startApi(): Promise<TestApi> {
  const server: Server = createServer(async (req, res) => {
    try {
      if (await handleAppApi(req, res)) return;
      // index.ts merge mai departe cu webhook-ul / health check-ul; aici nu există altceva.
      sendJson(res, 404, { ok: false, code: 'NOT_API', message: 'Doar /app/v1/* există în testul acesta' });
    } catch (err) {
      sendJson(res, 500, { ok: false, code: 'TEST_SERVER', message: String(err) });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    async api(method, path, body, token) {
      const url = path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/app/v1/${path}`;
      const headers: Record<string, string> = {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = { raw: text };
      }
      return { status: res.status, body: parsed as any, headers: res.headers };
    },
    stop() {
      return new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
