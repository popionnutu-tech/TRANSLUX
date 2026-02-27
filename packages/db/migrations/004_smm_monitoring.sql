-- ============================================================
-- 004: SMM Monitoring tables
-- ============================================================

CREATE TYPE smm_platform AS ENUM ('TIKTOK', 'FACEBOOK');

-- Social media accounts registered by admin
CREATE TABLE smm_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform smm_platform NOT NULL,
  account_name TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, account_name)
);

-- Per-post/video metrics (upsert on re-fetch)
CREATE TABLE smm_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES smm_accounts(id) ON DELETE CASCADE,
  platform_post_id TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  title TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, platform_post_id)
);

-- Daily aggregated metrics per account
CREATE TABLE smm_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES smm_accounts(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  posts_count INTEGER NOT NULL DEFAULT 0,
  total_views INTEGER NOT NULL DEFAULT 0,
  total_likes INTEGER NOT NULL DEFAULT 0,
  total_comments INTEGER NOT NULL DEFAULT 0,
  total_shares INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, stat_date)
);

CREATE INDEX idx_smm_accounts_platform ON smm_accounts(platform);
CREATE INDEX idx_smm_posts_account ON smm_posts(account_id);
CREATE INDEX idx_smm_posts_published ON smm_posts(published_at);
CREATE INDEX idx_smm_daily_stats_account_date ON smm_daily_stats(account_id, stat_date);
CREATE INDEX idx_smm_daily_stats_date ON smm_daily_stats(stat_date);
