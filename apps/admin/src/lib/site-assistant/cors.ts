// CORS pentru rutele publice ale asistentului: răspund DOAR paginilor site-ului.
// Mutat din app/api/asistent-site/route.ts când a apărut a doua rută (pozitie):
// un fișier de rută Next nu are voie să exporte altceva decât handler-e.
import type { NextRequest } from 'next/server';

const ORIGINS = new Set([
  'https://translux.md',
  'https://www.translux.md',
  'https://translux-web.vercel.app',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : []),
]);

export function cors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  if (!ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
