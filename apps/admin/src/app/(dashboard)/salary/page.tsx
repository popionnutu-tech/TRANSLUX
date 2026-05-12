export const dynamic = 'force-dynamic';

import { getSalaryData } from './actions';
import SalaryClient from './SalaryClient';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonthRange(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return { dateFrom: toDateStr(firstDay), dateTo: toDateStr(lastDay) };
}

export default async function SalaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const now = new Date();
  const year = params.year ? parseInt(params.year) : now.getFullYear();
  const month = params.month ? parseInt(params.month) - 1 : now.getMonth();

  const { dateFrom, dateTo } = getMonthRange(year, month);
  const salaryData = await getSalaryData(dateFrom, dateTo);

  return (
    <SalaryClient
      salaryData={salaryData}
      year={year}
      month={month}
    />
  );
}
