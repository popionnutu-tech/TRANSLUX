-- Offers: promotional prices for specific routes/directions
CREATE TABLE offers (
  id SERIAL PRIMARY KEY,
  from_locality TEXT NOT NULL,       -- name_ro of locality (e.g. 'Bălți')
  to_locality TEXT NOT NULL,         -- name_ro of locality (e.g. 'Chișinău')
  original_price INT NOT NULL,       -- original price in LEI
  offer_price INT NOT NULL,          -- promotional price in LEI
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: Bălți → Chișinău offer
INSERT INTO offers (from_locality, to_locality, original_price, offer_price)
VALUES ('Bălți', 'Chișinău', 120, 100);
