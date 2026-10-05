import { NextRequest, NextResponse } from 'next/server';

// ION-249 (Ion, 05.10: «să se poată suna numărul dacă se apasă pe telefonul de la bilet la hartă»): în mini app-ul
// Telegram linkurile tel: sunt blocate, așa că aplicația deschide adresa aceasta în browserul telefonului, iar ea trimite
// mai departe spre tel: — telefonul arată dialogul de apel. Doar numere moldovenești (373 + 8 cifre): nu e o redirecționare
// deschisă spre orice.

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const t = (req.nextUrl.searchParams.get('t') ?? '').replace(/\D/g, '');
  if (!/^373\d{8}$/.test(t)) return new NextResponse('Număr nevalid', { status: 400 });
  return new NextResponse(null, { status: 302, headers: { Location: `tel:+${t}`, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
