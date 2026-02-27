export const dynamic = 'force-dynamic';

import type { PointEnum } from '@translux/db';
import { getPivotReport } from './actions';
import { getSmmReport } from './smm-actions';
import ReportsClient from './ReportsClient';
import SmmReportsClient from './SmmReportsClient';

function getCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return {
    dateFrom: monday.toISOString().slice(0, 10),
    dateTo: sunday.toISOString().slice(0, 10),
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const defaults = getCurrentWeek();

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
    />
  );
}
