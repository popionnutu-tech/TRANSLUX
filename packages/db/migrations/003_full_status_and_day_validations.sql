-- Add FULL status for "Microbuzul full" reports (Bălți operators)
ALTER TYPE report_status ADD VALUE 'FULL';

-- Day validations: operator must validate each day before starting the next
CREATE TABLE day_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  validation_date DATE NOT NULL,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, validation_date)
);

CREATE INDEX idx_day_validations_user ON day_validations(user_id);
