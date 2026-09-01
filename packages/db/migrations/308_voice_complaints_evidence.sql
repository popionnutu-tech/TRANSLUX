-- ============================================================================
-- Reclamații — pe ce se sprijină identificarea vinovatului (01.09.2026)
--
-- Măsurat pe prod la revizuirea de securitate: în 30 de zile, 581 din 737 de
-- perechi «rută + zi» (78,8%) au avut UN singur șofer. Orarul e public. Deci
-- «rută + zi» singure numesc un om real, fără ca apelantul să fi urcat vreodată
-- în autobuz — o unealtă de calomnie prin telefon anonim.
--
-- Decizia lui Ion (01.09): reclamația se înregistrează oricum, dar se vede pe ce
-- se sprijină. Omul care cercetează trebuie să știe dacă vinovatul vine dintr-un
-- semn adus de client (plăcuța, numele) sau doar din orar.
-- ============================================================================
BEGIN;

ALTER TABLE voice_complaints ADD COLUMN IF NOT EXISTS evidence text;
COMMENT ON COLUMN voice_complaints.evidence IS 'Pe ce se sprijină identificarea: plate = clientul a dat numărul mașinii; name = a dat numele șoferului; trip_only = doar rută+zi+oră, adică din orar, fără niciun semn adus de client.';

COMMIT;
