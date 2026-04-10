-- 026_analytics.sql
-- Tracking page views and search queries for site analytics

CREATE TABLE page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path VARCHAR(255) NOT NULL,
  country VARCHAR(2),
  device VARCHAR(20),
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_locality VARCHAR(100) NOT NULL,
  to_locality VARCHAR(100) NOT NULL,
  search_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_views_created ON page_views(created_at);
CREATE INDEX idx_search_log_created ON search_log(created_at);
CREATE INDEX idx_search_log_route ON search_log(from_locality, to_locality);
