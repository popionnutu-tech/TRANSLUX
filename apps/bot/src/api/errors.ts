/**
 * Eroare de API pentru aplicația de peron: statusul HTTP + un cod scurt pe care
 * aplicația îl poate interpreta (BAD_CODE, UNAUTHORIZED, CLEANING_REQUIRED…).
 * Handler-ele o aruncă; `server.ts` o transformă în `{ ok: false, code, message }`.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function badRequest(message: string, code = 'BAD_REQUEST'): ApiError {
  return new ApiError(400, code, message);
}

export function unauthorized(message = 'Neautorizat', code = 'UNAUTHORIZED'): ApiError {
  return new ApiError(401, code, message);
}
