import { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';
import { getGraficData, getGraficEdinetRows } from '@/app/(dashboard)/grafic/actions';
import { generateScheduleImage, generateScheduleEdinetImage } from '@/lib/schedule-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return new Response('Neautorizat', { status: 401 });
  }
  if (session.role !== 'ADMIN' && session.role !== 'GRAFIC' && session.role !== 'DISPATCHER') {
    return new Response('Acces interzis', { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const date = searchParams.get('date');
  const pageStr = searchParams.get('page');
  const merge = searchParams.get('merge') === '1';
  const type = searchParams.get('type') || 'general';

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response('Parametru "date" lipsă sau invalid (YYYY-MM-DD)', { status: 400 });
  }

  try {
    const [y, m, d] = date.split('-');

    if (type === 'edinet') {
      const rows = await getGraficEdinetRows(date);
      const imageBuffer = await generateScheduleEdinetImage(rows, date);
      const filename = `grafic-edinet-${d}.${m}.${y}.png`;
      return new Response(new Uint8Array(imageBuffer), {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache, no-store',
        },
      });
    }

    const data = await getGraficData(date);

    let rows;
    let filenameSuffix: string;

    if (merge) {
      // Merge both pages — only assigned routes
      rows = [...data.page1.filter(r => r.driver_id), ...data.page2.filter(r => r.driver_id)];
      filenameSuffix = '';
    } else {
      const page = pageStr === '2' ? 2 : 1;
      rows = page === 1 ? data.page1 : data.page2;
      filenameSuffix = `-p${page}`;
    }

    const imageBuffer = await generateScheduleImage(rows, date);
    const filename = `grafic-${d}.${m}.${y}${filenameSuffix}.png`;

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
