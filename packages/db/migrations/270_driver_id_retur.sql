-- Șofer separat pentru retur pe aceeași atribuire (cerința Ion 24.08):
-- «pe cursa curentă aleg alt șofer și auto pentru retur».
alter table daily_assignments add column if not exists driver_id_retur uuid references drivers(id);
