-- 279: «Отаки» — varianta care cade între cele două forme
--
-- După 278 mergeau «Атаки» (nume nou) și «Отачь» (alias). A treia formă, cea mai
-- probabilă la ureche — «Отаки» — pica: cheia «отак» nu e egală cu «атак», iar
-- treapta fuzzy din voice-locality.ts nu pornește deloc sub 5 caractere (maxD = 0).
--
-- Aici o închidem cu un alias. Cauza de fond rămâne: numele scurte n-au NICIO
-- toleranță la greșeli de transcriere. Se repară în cod, nu în date.

insert into voice_asr_aliases (heard, canonical_ro, source, evidence, active)
values ('Отаки', 'Otaci', 'human',
        '{"why": "intre Атаки si Отачь; cheia scurta nu prinde treapta fuzzy"}'::jsonb, true)
on conflict do nothing;
