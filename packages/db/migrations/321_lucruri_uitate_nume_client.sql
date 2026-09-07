-- 321_lucruri_uitate_nume_client.sql
-- Numele clientului la lucrurile uitate (Ion, 07.09: «în chat cu șoferi să se
-- trimită ... numărul omului ca șoferul să o poată găsi și numele»).
--
-- Numărul NU are nevoie de coloană: vine din voice_calls.caller_phone, adică din
-- telefonie, și se dă mesajului din grupă direct în webhook. Numele n-are de unde
-- veni — nu există tabel de clienți, iar în transcript e text liber — deci se
-- culege în apel și se păstrează aici.
--
-- ATENȚIE, migrația SINGURĂ nu pornește nimic. După aplicare mai trebuie:
--   1. `claimLostItemForGroup` / `getLostItemSummary` să ceară și caller_name;
--   2. find-past-trip să accepte `caller_name` din body și să-l dea lui saveLostItem;
--   3. în ElevenLabs, schema tool-ului find_past_trip să capete câmpul `caller_name`,
--      iar promptul să ceară numele la lucrurile uitate.
-- Fără (3) coloana rămâne goală: modelul nu poate trimite un câmp inexistent în schemă.
--
-- Numele e dat de un străin la telefon și ajunge într-un chat cu ~20 de șoferi.
-- Plafon scurt, ca la celelalte texte de model: un text lung ar umple rândul și
-- ar putea trece mesajul peste limita Telegram de 4096, care respinge TOT mesajul.

alter table voice_lost_items
  add column if not exists caller_name text;

-- RLS deny-all există deja pe tabel (migr. 314) și acoperă coloana nouă.
