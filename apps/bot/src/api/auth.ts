/**
 * Autentificarea aplicației de peron.
 *
 * Adminul generează în pagina Utilizatori un cod de 6 cifre (peron_app_link_codes,
 * 24 h, o singură folosire). Aplicația îl schimbă pe un token de 32 de octeți
 * aleatori (hex); pe server rămâne doar sha256(token) în peron_app_sessions.
 * Token-ul nu expiră — adminul îl revocă prin `revoked_at`.
 */
import { createHash, randomBytes } from 'crypto';
import type { IncomingMessage } from 'http';
import type { PeronAppLinkCode, PeronAppSession, PointEnum, User } from '@translux/db';
import { getSupabase } from '../supabase.js';
import { ApiError, unauthorized } from './errors.js';

export interface AppUser {
  id: string;
  name: string | null;
  point: PointEnum;
  telegram_id: number | null;
  sessionId: string;
}

export interface LinkResult {
  token: string;
  user: { id: string; name: string | null; point: PointEnum };
}

const LINK_CODE_RE = /^\d{6}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const LAST_SEEN_MIN_INTERVAL_MS = 60_000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** Ce vede aplicația ca nume: @username sau nimic (botul nu are nomenclator de nume). */
export function displayName(user: Pick<User, 'username'>): string | null {
  return user.username ? `@${user.username}` : null;
}

/** Operator de peron valid pentru aplicație: activ, CONTROLLER, cu punct CHISINAU/BALTI. */
export function isPeronUser(user: User | null | undefined): user is User & { point: PointEnum } {
  return !!user && user.active && user.role === 'CONTROLLER' && (user.point === 'CHISINAU' || user.point === 'BALTI');
}

export async function linkWithCode(code: string, deviceLabel: string | null): Promise<LinkResult> {
  const bad = () => new ApiError(401, 'BAD_CODE', 'Cod greșit, expirat sau deja folosit');
  if (!LINK_CODE_RE.test(code)) throw bad();

  const db = getSupabase();
  const { data: row, error } = await db
    .from('peron_app_link_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  const link = row as PeronAppLinkCode | null;
  if (!link || link.used_at || Date.parse(link.expires_at) <= Date.now()) throw bad();

  const { data: u } = await db.from('users').select('*').eq('id', link.user_id).maybeSingle();
  const user = u as User | null;
  if (!isPeronUser(user)) throw bad();

  // O singură folosire, și la două telefoane simultan: câștigă cel care marchează used_at.
  const { data: claimed, error: claimErr } = await db
    .from('peron_app_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code)
    .is('used_at', null)
    .select('code');
  if (claimErr) throw claimErr;
  if (!claimed || claimed.length === 0) throw bad();

  const token = generateToken();
  const { error: sessErr } = await db.from('peron_app_sessions').insert({
    user_id: user.id,
    token_hash: hashToken(token),
    device_label: deviceLabel,
    last_seen_at: new Date().toISOString(),
  });
  if (sessErr) throw sessErr;

  return { token, user: { id: user.id, name: displayName(user), point: user.point } };
}

export function bearerToken(req: Pick<IncomingMessage, 'headers'>): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+([0-9a-fA-F]{64})\s*$/.exec(h);
  return m ? m[1].toLowerCase() : null;
}

export async function authenticate(req: Pick<IncomingMessage, 'headers'>): Promise<AppUser> {
  const token = bearerToken(req);
  if (!token || !TOKEN_RE.test(token)) throw unauthorized();

  const db = getSupabase();
  const { data: s, error } = await db
    .from('peron_app_sessions')
    .select('*')
    .eq('token_hash', hashToken(token))
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;
  const session = s as PeronAppSession | null;
  if (!session) throw unauthorized();

  const { data: u } = await db.from('users').select('*').eq('id', session.user_id).maybeSingle();
  const user = u as User | null;
  if (!isPeronUser(user)) throw unauthorized('Utilizatorul nu mai are acces la aplicație');

  const lastSeen = session.last_seen_at ? Date.parse(session.last_seen_at) : 0;
  if (Date.now() - lastSeen >= LAST_SEEN_MIN_INTERVAL_MS) {
    const { error: seenErr } = await db
      .from('peron_app_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', session.id);
    if (seenErr) console.error('[app-api] last_seen_at update failed:', seenErr.message);
  }

  return { id: user.id, name: displayName(user), point: user.point, telegram_id: user.telegram_id, sessionId: session.id };
}
