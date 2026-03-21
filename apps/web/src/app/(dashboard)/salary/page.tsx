export const dynamic = 'force-dynamic';

import { getSalaryData } from './actions';
import SalaryClient from './SalaryClient';

type Period = 'weekly' | 'monthly';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRange(period: Period) {
  const now = new Date();

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

export default async function SalaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const period = (params.period as Period) || 'monthly';
  const defaults = getDateRange(period);

  const dateFrom = params.dateFrom || defaults.dateFrom;
  const dateTo = params.dateTo || defaults.dateTo;

  const salaryData = await getSalaryData(dateFrom, dateTo);

  return (
    <SalaryClient
      salaryData={salaryData}
      dateFrom={dateFrom}
      dateTo={dateTo}
      period={period}
    />
  );
}
