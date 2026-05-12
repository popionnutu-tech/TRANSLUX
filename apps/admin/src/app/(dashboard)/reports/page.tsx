export const dynamic = 'force-dynamic';

import type { PointEnum } from '@translux/db';
import { getPivotReport } from './actions';
import type { PivotRawRow } from './actions';
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

function getPreviousPeriodDates(period: string, dateFrom: string, dateTo: string) {
  if (period === 'weekly') {
    const from = new Date(dateFrom + 'T12:00:00');
    const to = new Date(dateTo + 'T12:00:00');
    from.setDate(from.getDate() - 7);
    to.setDate(to.getDate() - 7);
    return { dateFrom: toDateStr(from), dateTo: toDateStr(to) };
  }
  if (period === 'monthly') {
    const fromDate = new Date(dateFrom + 'T12:00:00');
    const prevFirst = new Date(fromDate.getFullYear(), fromDate.getMonth() - 1, 1);
    const prevLast = new Date(fromDate.getFullYear(), fromDate.getMonth(), 0);
    return { dateFrom: toDateStr(prevFirst), dateTo: toDateStr(prevLast) };
  }
  return null;
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

  const isStandardPeriod = !!params.period && ['weekly', 'monthly'].includes(params.period);

  const pivotData = await getPivotReport(dateFrom, dateTo, point);

  let comparisonPivotData: PivotRawRow[] = [];
  let comparisonDateFrom = '';
  let comparisonDateTo = '';

  if (isStandardPeriod) {
    const prev = getPreviousPeriodDates(period, dateFrom, dateTo);
    if (prev) {
      comparisonDateFrom = prev.dateFrom;
      comparisonDateTo = prev.dateTo;
      comparisonPivotData = await getPivotReport(prev.dateFrom, prev.dateTo, point);
    }
  }

  return (
    <ReportsClient
      pivotData={pivotData}
      comparisonPivotData={comparisonPivotData}
      dateFrom={dateFrom}
      dateTo={dateTo}
      comparisonDateFrom={comparisonDateFrom}
      comparisonDateTo={comparisonDateTo}
      viewMode={viewMode}
      point={point}
      period={period}
      isStandardPeriod={isStandardPeriod}
    />
  );
}
