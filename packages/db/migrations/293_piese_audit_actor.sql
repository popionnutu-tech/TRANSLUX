-- 293: Numele autorului se FOTOGRAFIAZĂ la scriere, nu se rezolvă la citire.
--
-- Trei probleme, toate cu aceeași cauză — urma depindea de starea CURENTĂ a contului:
--
-- 1. `admin_accounts.name` nu e scris niciodată de aplicație (`createAdminAccount` inserează doar
--    email/parolă/rol/activ). Verificat: 12 din 19 conturi n-au nume, inclusiv `admin@translux.md`.
--    Deci coloana „Cine" ar fi arătat „necunoscut" pentru aproape toată lumea — adică exact rezultatul
--    pe care migrațiile 291/292 îl promiteau.
-- 2. `admin_id` are `on delete set null` (migr. 291), dar jurnalul e append-only (migr. 292): ștergerea
--    unui cont ar fi încercat un UPDATE pe urmă, pe care triggerul îl respinge — iar dacă ar fi trecut,
--    ar fi șters autorul dintr-un jurnal declarat imuabil. Cele două migrații se contraziceau.
-- 3. Redenumirea unui cont rescria retroactiv coloana „Cine" pentru fapte vechi. Numele furnizorului se
--    fotografia deja la scriere; actorul nu — două reguli diferite pentru „numele de la momentul faptei".
--
-- Fotografierea le închide pe toate trei: urma nu mai depinde de nimic din afara ei.

alter table piese_audit_log
  add column if not exists actor_label text;

comment on column piese_audit_log.actor_label is
  'Numele autorului AȘA CUM ERA la momentul faptei. Urma nu depinde de starea curentă a contului: '
  'rezistă la redenumire și la ștergerea contului (admin_id devine NULL, eticheta rămâne).';
