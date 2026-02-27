export const dynamic = 'force-dynamic';

import type { PointEnum } from '@translux/db';
import { getPivotReport } from './actions';
import { getSmmReport } from './smm-actions';
import ReportsClient from './ReportsClient';
import SmmReportsClient from './SmmReportsClient';

type Period = 'daily' | 'weekly' | 'monthly';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRange(period: Period) {
  const now = new Date();
  const today = toDateStr(now);

  if (period === 'daily') {
    return { dateFrom: today, dateTo: today };
  }

  if (period === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { dateFrom: toDateStr(monday), dateTo: toDateStr(sunday) };
  }

  // monthly
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: toDateStr(firstDay), dateTo: toDateStr(lastDay) };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const period = (params.period as Period) || 'weekly';
  const defaults = getDateRange(period);

  const dateFrom = params.dateFrom || defaults.dateFrom;
  const dateTo = params.dateTo || defaults.dateTo;
  const viewMode = (params.view as 'daily' | 'weekly') || 'daily';
  const point = (params.point as PointEnum) || 'CHISINAU';
  const reportType = (params.reportType as 'transport' | 'smm') || 'transport';

  if (reportType === 'smm') {
    const smmData = await getSmmReport(dateFrom, dateTo);
    return (
      <SmmReportsClient
        smmData={smmData}
        dateFrom={dateFrom}
        dateTo={dateTo}
        period={period}
      />
    );
  }

  const pivotData = await getPivotReport(dateFrom, dateTo, point);

  return (
    <ReportsClient
      pivotData={pivotData}
      dateFrom={dateFrom}
      dateTo={dateTo}
      viewMode={viewMode}
      point={point}
      period={period}
    />
  );
}
