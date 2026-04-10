import { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';
import { getGraficData } from '@/app/(dashboard)/grafic/actions';
import { generateScheduleImage } from '@/lib/schedule-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return new Response('Neautorizat', { status: 401 });
  }
  if (session.role !== 'ADMIN' && session.role !== 'GRAFIC') {
    return new Response('Acces interzis', { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const date = searchParams.get('date');
  const pageStr = searchParams.get('page');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response('Parametru "date" lipsă sau invalid (YYYY-MM-DD)', { status: 400 });
  }

  const page = pageStr === '2' ? 2 : 1;

  try {
    const data = await getGraficData(date);
    const rows = page === 1 ? data.page1 : data.page2;
    const imageBuffer = await generateScheduleImage(rows, date, page as 1 | 2);

    const [y, m, d] = date.split('-');
    const filename = `grafic-${d}.${m}.${y}-p${page}.png`;

    return new Response(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (err: any) {
    console.error('Schedule image generation error:', err);
    return new Response('Eroare la generare imagine', { status: 500 });
  }
}
