-- Track phone call button clicks for conversion analytics
CREATE TABLE IF NOT EXISTS call_clicks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_locality VARCHAR(100),
  to_locality VARCHAR(100),
  driver_phone VARCHAR(20),
  country VARCHAR(2),
  device VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_call_clicks_created ON call_clicks(created_at);
