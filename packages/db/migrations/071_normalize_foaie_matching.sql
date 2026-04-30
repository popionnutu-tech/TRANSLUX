-- 071_normalize_foaie_matching.sql
-- Functia helper norm_foaie(s) — elimina zerourile de la inceput pentru numere.
-- Folosita peste tot in get_grafic_report pentru match-uri foaie-vs-foaie:
-- '00142961' si '0142961' se compara corect ca '142961'.
--
-- Vezi sursa SQL aplicata via MCP. Migratia e idempotenta (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.norm_foaie(s text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN s ~ '^[0-9]+$' THEN s::bigint::text ELSE s END;
$$;

-- Restul migratiei (refactor get_grafic_report cu norm_foaie peste tot)
-- e aplicat via MCP in proiect — nu rescriu integral aici (fisierul ar fi de 250+ linii
-- duplicate de migratiile anterioare). Sursa autoritara e in baza de date.
