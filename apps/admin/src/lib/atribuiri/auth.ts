import { authFromInitData, type ZUser } from '@/lib/zadachnik/auth';
import { managerDirections } from './core';

// Autorizarea Mini App-ului de atribuiri: ADMIN vede tot; MANAGER_LDE vede doar
// direcțiile lui din lde_manager_directions; oricine altcineva → null (403).

export interface AtribuiriAuth {
  user: ZUser;
  directions: string[] | null; // null = toate (ADMIN)
}

export async function authAtribuiri(initData: string | null): Promise<AtribuiriAuth | null> {
  const user = await authFromInitData(initData);
  if (!user) return null;
  if (user.role === 'ADMIN') return { user, directions: null };
  if (user.role === 'MANAGER_LDE') {
    const dirs = await managerDirections(user.id);
    return dirs.length ? { user, directions: dirs } : null;
  }
  return null;
}

export function canDirection(auth: AtribuiriAuth, direction: string): boolean {
  return auth.directions === null || auth.directions.includes(direction);
}
