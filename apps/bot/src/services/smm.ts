import { getSupabase } from '../supabase.js';
import type { SmmAccount, SmmPlatform } from '@translux/db';

const db = () => getSupabase();

// ── Account queries ────────────────────────────────

export async function getActiveSmmAccounts(): Promise<SmmAccount[]> {
  const { data } = await db()
    .from('smm_accounts')
    .select('*')
    .eq('active', true)
    .order('platform')
    .order('account_name');
  return (data || []) as SmmAccount[];
}

// ── TikTok Display API v2 ──────────────────────────

interface TikTokVideo {
  id: string;
  title: string;
  create_time: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
}

export async function fetchTikTokVideos(account: SmmAccount): Promise<TikTokVideo[]> {
  await refreshTikTokTokenIfNeeded(account);

  const allVideos: TikTokVideo[] = [];
  let cursor: number | undefined;
  let hasMore = true;

  while (hasMore) {
    const body: Record<string, unknown> = { max_count: 20 };
    if (cursor !== undefined) body.cursor = cursor;

    const res = await fetch(
      'https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,like_count,comment_count,share_count,view_count',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      console.error(`TikTok API error for ${account.account_name}: ${res.status}`);
      break;
    }

    const json = await res.json();
    const videos = json.data?.videos || [];
    allVideos.push(...videos);

    hasMore = json.data?.has_more || false;
    cursor = json.data?.cursor;

    if (allVideos.length >= 200) break;
  }

  return allVideos;
}

async function refreshTikTokTokenIfNeeded(account: SmmAccount): Promise<void> {
  if (!account.token_expires_at || !account.refresh_token) return;

  const expiresAt = new Date(account.token_expires_at).getTime();
  const now = Date.now();
  if (expiresAt - now > 60 * 60 * 1000) return;

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    console.error('TIKTOK_CLIENT_KEY/SECRET not set, cannot refresh token');
    return;
  }

  try {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token,
      }),
    });

    const json = await res.json();
    if (json.access_token) {
      const newExpires = new Date(now + (json.expires_in || 86400) * 1000).toISOString();
      await db()
        .from('smm_accounts')
        .update({
          access_token: json.access_token,
          refresh_token: json.refresh_token || account.refresh_token,
          token_expires_at: newExpires,
        })
        .eq('id', account.id);

      account.access_token = json.access_token;
      account.token_expires_at = newExpires;
      console.log(`TikTok token refreshed for ${account.account_name}`);
    }
  } catch (err) {
    console.error(`TikTok token refresh failed for ${account.account_name}:`, err);
  }
}

// ── Facebook Graph API ─────────────────────────────

interface FacebookPost {
  id: string;
  message?: string;
  created_time: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
}

export async function fetchFacebookPosts(account: SmmAccount): Promise<FacebookPost[]> {
  const baseUrl = 'https://graph.facebook.com/v19.0';
  const token = account.access_token;

  // Fetch posts from the last 90 days with pagination
  const since = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
  let url: string | null =
    `${baseUrl}/${account.platform_id}/posts?fields=id,message,created_time&limit=100&since=${since}&access_token=${encodeURIComponent(token)}`;

  const allRawPosts: Array<{ id: string; message?: string; created_time: string }> = [];

  while (url) {
    const res: Response = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      console.error(`Facebook API error for ${account.account_name}: ${res.status} ${body}`);
      break;
    }

    const json: any = await res.json();
    const batch = json.data || [];
    allRawPosts.push(...batch);

    url = json.paging?.next || null;
    if (allRawPosts.length >= 500) break;
  }

  console.log(`Facebook: fetched ${allRawPosts.length} raw posts for ${account.account_name}`);

  const posts: FacebookPost[] = [];

  for (const raw of allRawPosts) {
    try {
      const detailRes = await fetch(
        `${baseUrl}/${raw.id}?fields=shares,reactions.summary(true),comments.summary(true)&access_token=${encodeURIComponent(token)}`
      );
      const detail = await detailRes.json();

      let viewCount = 0;
      try {
        const insightRes = await fetch(
          `${baseUrl}/${raw.id}/insights?metric=post_impressions&access_token=${encodeURIComponent(token)}`
        );
        const insight = await insightRes.json();
        viewCount = insight.data?.[0]?.values?.[0]?.value || 0;
      } catch { /* impressions not available for all post types */ }

      posts.push({
        id: raw.id,
        message: raw.message,
        created_time: raw.created_time,
        view_count: viewCount,
        like_count: detail.reactions?.summary?.total_count || 0,
        comment_count: detail.comments?.summary?.total_count || 0,
        share_count: detail.shares?.count || 0,
      });
    } catch (err) {
      console.error(`Facebook post detail error (${raw.id}):`, err);
    }
  }

  return posts;
}

// ── Data collection ────────────────────────────────

export async function collectSmmData(): Promise<void> {
  const accounts = await getActiveSmmAccounts();

  for (const account of accounts) {
    try {
      if (account.platform === 'TIKTOK') {
        const videos = await fetchTikTokVideos(account);
        for (const v of videos) {
          await db().from('smm_posts').upsert(
            {
              account_id: account.id,
              platform_post_id: v.id,
              published_at: new Date(v.create_time * 1000).toISOString(),
              title: v.title || null,
              view_count: v.view_count,
              like_count: v.like_count,
              comment_count: v.comment_count,
              share_count: v.share_count,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: 'account_id,platform_post_id' }
          );
        }
        console.log(`TikTok: ${videos.length} videos synced for ${account.account_name}`);
      } else if (account.platform === 'FACEBOOK') {
        const posts = await fetchFacebookPosts(account);
        for (const p of posts) {
          await db().from('smm_posts').upsert(
            {
              account_id: account.id,
              platform_post_id: p.id,
              published_at: new Date(p.created_time).toISOString(),
              title: (p.message || '').slice(0, 200) || null,
              view_count: p.view_count,
              like_count: p.like_count,
              comment_count: p.comment_count,
              share_count: p.share_count,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: 'account_id,platform_post_id' }
          );
        }
        console.log(`Facebook: ${posts.length} posts synced for ${account.account_name}`);
      }
    } catch (err) {
      console.error(`SMM collection error for ${account.account_name}:`, err);
    }
  }
}

// ── Aggregate daily stats ──────────────────────────

export async function aggregateDailyStats(date: string): Promise<void> {
  const accounts = await getActiveSmmAccounts();

  for (const account of accounts) {
    const { data: posts } = await db()
      .from('smm_posts')
      .select('view_count, like_count, comment_count, share_count')
      .eq('account_id', account.id)
      .gte('published_at', `${date}T00:00:00`)
      .lt('published_at', `${date}T23:59:59.999`);

    const rows = (posts || []) as Array<{
      view_count: number;
      like_count: number;
      comment_count: number;
      share_count: number;
    }>;

    await db().from('smm_daily_stats').upsert(
      {
        account_id: account.id,
        stat_date: date,
        posts_count: rows.length,
        total_views: rows.reduce((s, r) => s + (r.view_count || 0), 0),
        total_likes: rows.reduce((s, r) => s + (r.like_count || 0), 0),
        total_comments: rows.reduce((s, r) => s + (r.comment_count || 0), 0),
        total_shares: rows.reduce((s, r) => s + (r.share_count || 0), 0),
      },
      { onConflict: 'account_id,stat_date' }
    );
  }
}

// ── Aggregate date range ──────────────────────────

export async function aggregateRangeStats(dateFrom: string, dateTo: string): Promise<void> {
  const d = new Date(dateFrom + 'T12:00:00');
  const end = new Date(dateTo + 'T12:00:00');
  while (d <= end) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    await aggregateDailyStats(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
}

// ── Report queries ─────────────────────────────────

export interface SmmDailyReport {
  account_name: string;
  platform: SmmPlatform;
  posts_count: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
}

export async function getSmmDailyReport(date: string): Promise<SmmDailyReport[]> {
  const { data } = await db()
    .from('smm_daily_stats')
    .select('*, smm_accounts!inner(account_name, platform)')
    .eq('stat_date', date);

  return ((data || []) as any[]).map((r) => ({
    account_name: r.smm_accounts.account_name,
    platform: r.smm_accounts.platform as SmmPlatform,
    posts_count: r.posts_count,
    total_views: r.total_views,
    total_likes: r.total_likes,
    total_comments: r.total_comments,
    total_shares: r.total_shares,
  }));
}

export async function getSmmWeeklyReport(
  dateFrom: string,
  dateTo: string
): Promise<SmmDailyReport[]> {
  const { data } = await db()
    .from('smm_daily_stats')
    .select(
      'account_id, posts_count, total_views, total_likes, total_comments, total_shares, smm_accounts!inner(account_name, platform)'
    )
    .gte('stat_date', dateFrom)
    .lte('stat_date', dateTo);

  const map = new Map<string, SmmDailyReport>();
  for (const r of (data || []) as any[]) {
    const key = r.account_id as string;
    if (!map.has(key)) {
      map.set(key, {
        account_name: r.smm_accounts.account_name,
        platform: r.smm_accounts.platform,
        posts_count: 0,
        total_views: 0,
        total_likes: 0,
        total_comments: 0,
        total_shares: 0,
      });
    }
    const entry = map.get(key)!;
    entry.posts_count += r.posts_count;
    entry.total_views += r.total_views;
    entry.total_likes += r.total_likes;
    entry.total_comments += r.total_comments;
    entry.total_shares += r.total_shares;
  }

  return Array.from(map.values());
}
