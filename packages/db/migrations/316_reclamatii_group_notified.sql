-- ============================================================================
-- Reclamații — grupa a văzut acuzația? (02.09.2026)
--
-- `alerted` spune că ADMINII au primit mesajul. Grupa șoferilor e altă audiență:
-- ea primește doar tipurile care cad pe șofer. Fără coloana asta, corectarea
-- («Nu mai e vorba de X») și retragerea se decideau după alerta adminilor și
-- puteau numi în fața a douăzeci de colegi un om pe care grupa nu-l văzuse
-- niciodată acuzat — un mesaj disculpant care îl numea pentru prima dată
-- (security 02.09, M-1).
-- ============================================================================
BEGIN;

ALTER TABLE voice_complaints
  ADD COLUMN IF NOT EXISTS group_notified boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN voice_complaints.group_notified IS 'true = grupa soferilor a vazut acuzatia. Corectarea si retragerea au voie sa numeasca omul de dinainte DOAR daca grupa l-a vazut - altfel mesajul disculpant l-ar numi pentru prima data (security 02.09).';

COMMIT;
