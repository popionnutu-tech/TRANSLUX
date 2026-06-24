-- ============================================================================
-- MODUL LDE — preț motorină (diesel) oglindit din TLX
--
-- Decizie Ion 24.06.2026: valorizarea litri→lei (carduri + DT перерасход) se face
-- la PREȚUL DE VÂNZARE al motorinei din rețeaua TLX (proiect АЗС separat,
-- project tvefsxwqsopfboiaikeq, tabel `prices` fuel_type='diesel').
--
-- Oglindim aici (în TRANSLUX) media pe stații per `valid_from`, ca aplicația LDE
-- să citească LOCAL (fără dependență runtime de proiectul TLX) și să avem ISTORIC
-- pe dată (necesar pt DT pe perioade trecute). Worker-ul VPS îl actualizează nopți.
--
-- Preț pe o dată D = rândul cu cel mai mare valid_from <= D.
-- Înlocuiește hardcode-ul `fuelPriceLei=22` din carduri/actions.ts.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS lde_diesel_price (
  valid_from date PRIMARY KEY,                 -- data de la care e valabil prețul
  price_lei numeric(6,2) NOT NULL,             -- preț vânzare diesel (lei/l), medie pe stații TLX
  source text NOT NULL DEFAULT 'tlx_prices',
  imported_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lde_diesel_price IS 'Preț vânzare motorină oglindit din TLX (prices fuel_type=diesel, medie pe stații per valid_from). Sursă unică pt valorizare litri→lei în LDE. Worker VPS îl ține la zi. Preț pe dată = ultimul valid_from <= dată.';

-- RLS deny-all (anon nu vede; service_role bypassează; admin via getSupabase; worker scrie cu service_role)
ALTER TABLE lde_diesel_price ENABLE ROW LEVEL SECURITY;

COMMIT;
