-- 099_pending_price_updates_status_check.sql
-- Protejează enum-ul de statusuri al propunerilor de tarif (money path).
-- Statusuri valide: pending | approved | rejected | superseded | expired
alter table pending_price_updates
  add constraint pending_price_updates_status_check
  check (status in ('pending', 'approved', 'rejected', 'superseded', 'expired'));
