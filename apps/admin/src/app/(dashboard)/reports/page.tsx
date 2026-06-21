export const dynamic = 'force-dynamic';

import type { PointEnum } from '@translux/db';
import { getPivotReport, getTaxiZonePivotReport } from './actions';
import { getSmmReport } from './smm-actions';
import { getNumarareDaily, getNumarareWeekly } from './numarare-report-actions';
import ReportsClient from './ReportsClient';
import SmmReportsClient from './SmmReportsClient';
import NumarareReportsClient from './NumarareReportsClient';

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

function getPreviousWeekRange(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom + 'T12:00:00');
  const to = new Date(dateTo + 'T12:00:00');
  from.setDate(from.getDate() - 7);
  to.setDate(to.getDate() - 7);
  return { dateFrom: toDateStr(from), dateTo: toDateStr(to) };
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
  const point = (params.point as PointEnum | 'TAXI_ZONE') || 'CHISINAU';
  const reportType = (params.reportType as 'transport' | 'smm' | 'numarare') || 'transport';

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

  if (reportType === 'numarare') {
    const numarareView = (params.view as 'daily' | 'weekly') || 'daily';
    const today = toDateStr(new Date());
    const numarareDate = params.date || today;

    const [dailyData, weeklyData] = await Promise.all([
      numarareView === 'daily' ? getNumarareDaily(numarareDate) : Promise.resolve([]),
      numarareView === 'weekly' ? getNumarareWeekly(dateFrom, dateTo) : Promise.resolve([]),
    ]);

    return (
      <NumarareReportsClient
        dailyData={dailyData}
        weeklyData={weeklyData}
        viewMode={numarareView}
        date={numarareDate}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />
    );
  }

  const prev = getPreviousWeekRange(dateFrom, dateTo);
  const fetchPivot = (from: string, to: string) =>
    point === 'TAXI_ZONE' ? getTaxiZonePivotReport(from, to) : getPivotReport(from, to, point);
  const [pivotData, comparisonPivotData] = await Promise.all([
    fetchPivot(dateFrom, dateTo),
    fetchPivot(prev.dateFrom, prev.dateTo),
  ]);

  return (
    <ReportsClient
      pivotData={pivotData}
      comparisonPivotData={comparisonPivotData}
      dateFrom={dateFrom}
      dateTo={dateTo}
      viewMode={viewMode}
      point={point}
      period={period}
    />
  );
}
