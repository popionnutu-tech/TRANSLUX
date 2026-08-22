-- Memoria limbii (init-webhook) cauta ultimul apel dupa numar in calea calda
-- a salutului (race 2000ms) — fara index era seq scan + sort pe toata tabela.
create index if not exists idx_voice_calls_phone_created
  on voice_calls (caller_phone, created_at desc);
