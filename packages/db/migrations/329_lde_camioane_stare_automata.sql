-- 329_lde_camioane_stare_automata.sql
-- Stările cursei se pot muta și AUTOMAT (Ion, 08.09): «dacă mașina s-a încărcat
-- la Constanța, a ajuns în Moldova și stă, stă, stă — trece singură «la
-- descărcare»; dacă descarcă la o stație TLX, luăm din TLX când s-a descărcat și
-- închidem cursa; dacă descarcă în altă parte (baza Briceni), închide dispecerul».
--
-- Două semnale, două surse:
--  · gps — camionul stă (sub 5,6 km/h) în raza punctului de descărcare cel puțin
--    15 minute → «la descărcare». `unload_seen_at` e prima observare; a doua, la
--    peste 15 minute, confirmă. Iese din rază → se șterge.
--  · tlx — în TLX apare o recepție de carburant (fuel_receipts) cu numărul
--    camionului, la stația care corespunde punctului de descărcare → «încheiată».
--    Recepția se ține minte (id, oră, litri) ca aceeași recepție să nu închidă
--    două curse și ca dispecerul să vadă DE CE s-a închis.
-- Dispecerul poate face oricând același lucru manual — automatul nu ia butoane,
-- doar apasă el primul când are dovada. Cine a mutat starea se vede în
-- status_source; istoricul complet rămâne în lde_audit_log (updated_by = 'auto:gps' / 'auto:tlx').

alter table lde_truck_trips
  add column if not exists status_source text not null default 'manual'
    check (status_source in ('manual','gps','tlx')),
  add column if not exists status_changed_at timestamptz,
  add column if not exists unload_seen_at timestamptz,
  add column if not exists tlx_receipt_id uuid,
  add column if not exists tlx_receipt_at timestamptz,
  add column if not exists tlx_receipt_liters numeric;

comment on column lde_truck_trips.status_source is
  'Cine a pus starea curentă: manual (dispecer), gps (stă în raza punctului de descărcare), tlx (recepție de carburant în TLX).';
comment on column lde_truck_trips.status_changed_at is
  'Când s-a schimbat ultima dată starea (manual sau automat).';
comment on column lde_truck_trips.unload_seen_at is
  'Prima poziție GPS în care camionul stătea în raza punctului de descărcare; se confirmă după 15 min și cursa trece «la descărcare». NULL când e în mișcare sau în afara razei.';
comment on column lde_truck_trips.tlx_receipt_id is
  'fuel_receipts.id din baza TLX (alt proiect Supabase, fără FK) care a închis cursa. O recepție închide o singură cursă.';

-- Aceeași recepție TLX nu închide două curse.
create unique index if not exists uq_lde_truck_trips_tlx_receipt
  on lde_truck_trips (tlx_receipt_id) where tlx_receipt_id is not null;

-- Workerul citește des cursele deschise — index parțial pe stările vii.
create index if not exists idx_lde_truck_trips_deschise
  on lde_truck_trips (status) where status not in ('incheiata','anulata');
