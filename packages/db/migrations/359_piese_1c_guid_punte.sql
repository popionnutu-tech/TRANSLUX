-- 359: Puntea către 1C — GUID-ul fiecărei entități, așa cum îl știe contabilitatea.
--
-- Fișierul de schimb 1C („Конвертация данных 2.0") leagă TOTUL prin GUID-uri interne, iar regulile din el
-- spun `СинхронизироватьПоИдентификатору = true` FĂRĂ niciun câmp de căutare de rezervă (verificat pentru
-- nomenclator, depozite, angajați, mijloace fixe și tipuri de activitate).
--
-- Consecința e dură și tăcută: un GUID pe care 1C nu-l cunoaște NU dă eroare — creează un articol NOU.
-- Am exporta o eliberare și am dubla piesa în contabilitate; la a doua exportare, încă una. Ar fi mai rău
-- decât introducerea manuală de azi.
--
-- De aici și răspunsul la întrebarea contabilei („dacă nu diferă de încărcarea după articol, n-are sens"):
-- diferă fundamental. În formatul ăsta NU EXISTĂ încărcare după articol — nu e o variantă mai slabă, e o
-- variantă inexistentă. Un GUID pe care îl generăm noi și îl PĂSTRĂM înseamnă: articolul se creează o
-- singură dată, iar fiecare export următor îl regăsește. Fără păstrare, fiecare export ar crea încă unul.
--
-- `uuid` ca tip, nu `text`: formatul e fix, iar o valoare stricată trebuie să cadă la scriere, nu la
-- exportare — adică nu în momentul în care contabilitatea așteaptă fișierul.
ALTER TABLE piese_parts      ADD COLUMN IF NOT EXISTS guid_1c uuid;
ALTER TABLE piese_vehicles   ADD COLUMN IF NOT EXISTS guid_1c uuid;
ALTER TABLE piese_mechanics  ADD COLUMN IF NOT EXISTS guid_1c uuid;
ALTER TABLE piese_warehouses ADD COLUMN IF NOT EXISTS guid_1c uuid;

-- Unic acolo unde e completat: două piese ale noastre nu pot arăta spre același articol din 1C. Dacă s-ar
-- putea, o eliberare ar scădea în contabilitate de pe alt articol decât cel scos fizic de pe raft, iar
-- diferența n-ar fi vizibilă din nicio parte.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pparts_guid1c  ON piese_parts(guid_1c)      WHERE guid_1c IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pveh_guid1c    ON piese_vehicles(guid_1c)   WHERE guid_1c IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pmec_guid1c    ON piese_mechanics(guid_1c)  WHERE guid_1c IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pwh_guid1c     ON piese_warehouses(guid_1c) WHERE guid_1c IS NOT NULL;

-- Câte entități sunt gata de export și câte încă nu. Ecranul are nevoie de cifra asta ÎNAINTE ca cineva să
-- apese „exportă": „10 150 din 10 525 piese au legătură cu 1C" e o informație care se citește dintr-o
-- privire; un export care cade la a treia încercare nu e.
CREATE OR REPLACE VIEW piese_1c_acoperire AS
  SELECT 'piese'::text AS entitate,
         count(*) FILTER (WHERE guid_1c IS NOT NULL) AS cu_guid,
         count(*) AS total
    FROM piese_parts WHERE active
  UNION ALL
  SELECT 'masini', count(*) FILTER (WHERE guid_1c IS NOT NULL), count(*) FROM piese_vehicles WHERE active
  UNION ALL
  SELECT 'lacatusi', count(*) FILTER (WHERE guid_1c IS NOT NULL), count(*) FROM piese_mechanics
  UNION ALL
  SELECT 'depozite', count(*) FILTER (WHERE guid_1c IS NOT NULL), count(*) FROM piese_warehouses;

REVOKE ALL ON piese_1c_acoperire FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_1c_acoperire TO service_role;
