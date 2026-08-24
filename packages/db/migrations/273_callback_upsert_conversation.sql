-- O conversație = O cerere de callback (Ion/a9, 24.08): agentul înregistrează
-- cererea IMEDIAT și o îmbogățește pe parcurs — fără dubluri.
-- UNIQUE plin (nu parțial!): NULL-urile rămân nelimitate, non-null unic;
-- parțial ar rupe onConflict în PostgREST (lecția TLX 42P10).
create unique index if not exists idx_vcr_conversation
  on voice_callback_requests (conversation_id);
