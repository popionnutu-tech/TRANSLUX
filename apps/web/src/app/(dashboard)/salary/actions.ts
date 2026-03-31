'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import type { PointEnum } from '@translux/db';
import { getOperatorName, IURIE_TELEGRAM_ID } from '@/lib/operators';

const SALARY_RATES: Record<string, number> = {
  CHISINAU: 900,
  BALTI: 800,
};

const MAX_GEO_VIOLATIONS_PER_DAY = 3;
const TIKTOK_RATE_PER_VIDEO = 100;

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

export interface TiktokBonus {
  account1Name: string;
  account1Posts: number;
  account2Name: string;
  account2Posts: number;
  totalPosts: number;
  totalBonus: number;
}

export interface SalaryReport {
  operators: OperatorSalary[];
  tiktokBonus: TiktokBonus | null;
  dateFrom: string;
  dateTo: string;
}

export async function getSalaryData(dateFrom: string, dateTo: string): Promise<SalaryReport> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
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
    return { operators: [], tiktokBonus: null, dateFrom, dateTo };
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

  // 4. Get TikTok bonus — sum posts from TikTok SMM accounts
  let tiktokBonus: TiktokBonus | null = null;
  const { data: tiktokAccounts } = await supabase
    .from('smm_accounts')
    .select('id, account_name')
    .eq('platform', 'TIKTOK')
    .eq('active', true)
    .order('account_name');

  if (tiktokAccounts && tiktokAccounts.length > 0) {
    const accountIds = tiktokAccounts.map((a: any) => a.id);
    const { data: stats } = await supabase
      .from('smm_daily_stats')
      .select('account_id, posts_count')
      .in('account_id', accountIds)
      .gte('stat_date', dateFrom)
      .lte('stat_date', dateTo);

    const postsByAccount: Record<string, number> = {};
    for (const s of stats || []) {
      postsByAccount[s.account_id] = (postsByAccount[s.account_id] || 0) + s.posts_count;
    }

    const acc1 = tiktokAccounts[0];
    const acc2 = tiktokAccounts[1];
    const posts1 = postsByAccount[acc1?.id] || 0;
    const posts2 = acc2 ? (postsByAccount[acc2.id] || 0) : 0;
    const totalPosts = posts1 + posts2;

    tiktokBonus = {
      account1Name: acc1?.account_name || 'TikTok 1',
      account1Posts: posts1,
      account2Name: acc2?.account_name || 'TikTok 2',
      account2Posts: posts2,
      totalPosts,
      totalBonus: totalPosts * TIKTOK_RATE_PER_VIDEO,
    };
  }

  return { operators, tiktokBonus, dateFrom, dateTo };
}
