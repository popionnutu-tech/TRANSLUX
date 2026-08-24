-- 278: Otaci se rostește «Атаки» (Ion, 24.08: «е Атаки правильно»)
--
-- «Отачь» era transliterarea românescului; forma rusă vie e «Атаки».
-- ATENȚIE la efectul secundar: schimbând doar name_ru, cine spune «Отачь» nu mai
-- e recunoscut — cheia «отач» nu se potrivește cu «атаки», iar treapta fuzzy nici
-- nu pornește la 4 caractere (maxD = 0 sub 5 în voice-locality.ts). De aceea forma
-- veche intră explicit în tabelul de alias-uri, ca ambele să funcționeze.

update localities set name_ru = 'Атаки' where name_ro = 'Otaci' and name_ru = 'Отачь';

insert into voice_asr_aliases (heard, canonical_ro, source, evidence, active)
values ('Отачь', 'Otaci', 'human',
        '{"why": "forma veche din baza noastra; Ion 24.08: se spune Атаки"}'::jsonb, true)
on conflict do nothing;

-- Dicționarul ASR: slotul lui Otaci trece pe forma care chiar se rostește.
update voice_agent_canon
set value = (
      select jsonb_agg(case when x = 'Отачь' then to_jsonb('Атаки'::text) else to_jsonb(x) end order by ord)
      from jsonb_array_elements_text(value) with ordinality t(x, ord)
    ),
    updated_at = now()
where key = 'asr_keywords';
