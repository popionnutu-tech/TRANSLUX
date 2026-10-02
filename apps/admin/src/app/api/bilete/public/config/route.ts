import { NextResponse } from 'next/server';
import { configPublica } from '@/lib/bilete/public';

// GET /api/bilete/public/config — ce poate vinde site-ul: steagul global, închiderile pe direcție, rutele cu
// direcțiile deschise. Date publice (sunt pe butoanele site-ului oricum), deci fără cheie; cache scurt pe CDN.
// Site-ul tratează lipsa răspunsului ca «vânzare închisă».

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const cfg = await configPublica();
  return NextResponse.json({ ok: true, ...cfg }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
