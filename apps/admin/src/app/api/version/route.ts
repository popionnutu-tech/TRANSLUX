import { NextResponse } from 'next/server';

// Versiunea desfășurată: sha-ul commit-ului pe care rulează acest cod. O citește
// conveierul de sarcini (`tp verify`) ca să închidă tichetul doar după faptul din prod.
// Fără BD, fără secrete; variabilele le pune Vercel (System Environment Variables).
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? null,
  });
}
