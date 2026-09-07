-- 324_reclamatii_nume_client.sql
-- Numele clientului la reclamații (Ion, 07.09: «numele e necesar doar la
-- reclamații sau pierdere»). Perechea migrației 321 de la lucrurile uitate.
--
-- Numărul vine din telefonie (caller_phone există din 307). Numele n-are de
-- unde veni decât din apel — se culege și se păstrează aici. Merge DOAR în
-- alerta adminilor și în raportul de apel; în grupa șoferilor datele clientului
-- nu intră (decizia de la livrare, 02.09).

alter table voice_complaints
  add column if not exists caller_name text;

-- RLS deny-all există deja pe tabel (migr. 307) și acoperă coloana nouă.
