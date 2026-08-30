-- 299: un singur test per lecție. Fără unic, o invocare ucisă între «create la EL»
-- și marcarea lecției producea a doua zi un al DOILEA test pentru aceeași lecție —
-- ambele rulau la nesfârșit și ocupau plafonul de rotație (review 30.08, runda 5).
-- Codul are și gardă (refolosește test_id existent); indexul e plasa de siguranță.
create unique index if not exists voice_agent_tests_lesson_id_uniq
  on voice_agent_tests (lesson_id)
  where lesson_id is not null;
