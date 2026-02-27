'use server';

import { getSupabase } from '@/lib/supabase';
import type { SmmPlatform } from '@translux/db';

export interface SmmReportRow {
  account_name: string;
  platform: SmmPlatform;
  stat_date: string;
  posts_count: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
}

export async function getSmmReport(
  dateFrom: string,
  dateTo: string
): Promise<SmmReportRow[]> {
  const { data, error } = await getSupabase()
    .from('smm_daily_stats')
    .select(
      '*, smm_accounts!inner(account_name, platform)'
    )
    .gte('stat_date', dateFrom)
    .lte('stat_date', dateTo)
    .order('stat_date', { ascending: true });

  if (error) {
    console.error('SMM report query error:', error);
    return [];
  }

  return ((data || []) as any[]).map((r) => ({
    account_name: r.smm_accounts.account_name,
    platform: r.smm_accounts.platform,
    stat_date: r.stat_date,
    posts_count: r.posts_count,
    total_views: r.total_views,
    total_likes: r.total_likes,
    total_comments: r.total_comments,
    total_shares: r.total_shares,
  }));
}
