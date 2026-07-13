-- ============================================================================
-- MODUL LDE — cheie unică de rută pentru lde_atribuiri_zilnice.
--
-- Indexurile unice PARȚIALE din 236 nu pot fi țintă de ON CONFLICT prin
-- PostgREST (nu trimite predicatul WHERE) → materializarea lazy n-ar putea
-- folosi upsert ignoreDuplicates și ar avea curse la primul read al zilei.
-- route_key = identitatea cursei ca text → un singur UNIQUE(date, route_key).
--   uzina:  'uzina:<factory_route_id>:<shift_number>'
--   altele: 'crm:<crm_route_id>'
-- ============================================================================

ALTER TABLE lde_atribuiri_zilnice ADD COLUMN IF NOT EXISTS route_key text
  GENERATED ALWAYS AS (
    CASE WHEN route_kind = 'uzina'
      THEN 'uzina:' || factory_route_id::text || ':' || shift_number::text
      ELSE 'crm:' || crm_route_id::text
    END
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_atribuiri_date_key
  ON lde_atribuiri_zilnice (date, route_key);

-- indexurile parțiale din 236 devin redundante ca garanție (le păstrăm pe cele
-- de căutare; pe cele unice parțiale le scoatem ca să nu dubleze întreținerea)
DROP INDEX IF EXISTS uq_lde_atribuiri_uzina;
DROP INDEX IF EXISTS uq_lde_atribuiri_crm;
