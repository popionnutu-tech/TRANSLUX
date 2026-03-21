'use server';

import { getSupabase } from '@/lib/supabase';
import type { PointEnum } from '@translux/db';
import { getOperatorName, IURIE_TELEGRAM_ID } from '@/lib/operators';

const SALARY_RATES: Record<string, number> = {
  CHISINAU: 900,
  BALTI: 800,
};

const MAX_GEO_VIOLATIONS_PER_DAY = 3;

export interface OperatorDayDetail {
  date: string;
  totalReports: number;
  geoViolations: number;
  qualifies: boolean;
}

export interface OperatorSalary {
  userId: string;
  telegramId: number | null;
  telegramUsername: string | null;
  operatorName: string;
  point: PointEnum;
  dailyRate: number;
  workingDays: number;
  qualifiedDays: number;
  disqualifiedDays: number;
  baseSalary: number;
  dayDetails: OperatorDayDetail[];
}

export interface SalaryReport {
  operators: OperatorSalary[];
  dateFrom: string;
  dateTo: string;
}

export async function getSalaryData(dateFrom: string, dateTo: string): Promise<SalaryReport> {
  const supabase = getSupabase();

  // 1. Get all active CONTROLLER users, ordered by point then created_at
  const { data: users } = await supabase
    .from('users')
    .select('id, telegram_id, username, point, created_at')
    .eq('role', 'CONTROLLER')
    .eq('active', true)
    .order('point')
    .order('created_at');

  if (!users || users.length === 0) {
    return { operators: [], dateFrom, dateTo };
  }

  // 2. Get all non-cancelled reports in the period
  const { data: reports } = await supabase
    .from('reports')
    .select('id, report_date, point, created_by_user, location_ok')
    .is('cancelled_at', null)
    .gte('report_date', dateFrom)
    .lte('report_date', dateTo);

  const allReports = reports || [];

  // 3. Map operators with names by telegram_id
  const operators: OperatorSalary[] = users.map((user: any) => {
    const point: PointEnum = user.point;
    const operatorName = getOperatorName(user.telegram_id, user.username);
    const dailyRate = SALARY_RATES[point] || 900;

    // Group reports by date for this user
    const userReports = allReports.filter((r: any) => r.created_by_user === user.id);
    const byDate: Record<string, { total: number; geoViolations: number }> = {};

    for (const r of userReports) {
      const date = r.report_date;
      if (!byDate[date]) {
        byDate[date] = { total: 0, geoViolations: 0 };
      }
      byDate[date].total++;
      // location_ok === false means geo violation; null means no location check needed or legacy data
      if (r.location_ok === false) {
        byDate[date].geoViolations++;
      }
    }

    const dayDetails: OperatorDayDetail[] = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, info]) => ({
        date,
        totalReports: info.total,
        geoViolations: info.geoViolations,
        qualifies: info.geoViolations <= MAX_GEO_VIOLATIONS_PER_DAY,
      }));

    const workingDays = dayDetails.length;
    const qualifiedDays = dayDetails.filter((d) => d.qualifies).length;
    const disqualifiedDays = workingDays - qualifiedDays;

    return {
      userId: user.id,
      telegramId: user.telegram_id,
      telegramUsername: user.username,
      operatorName,
      point,
      dailyRate,
      workingDays,
      qualifiedDays,
      disqualifiedDays,
      baseSalary: qualifiedDays * dailyRate,
      dayDetails,
    };
  });

  return { operators, dateFrom, dateTo };
}
