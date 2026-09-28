-- 431: harta fiecărei mașini pe zi (ION-130)
--
-- Ion, 28.09.2026: «ar fi bine să putem fiecare mașină s-o vizualizăm pe schelet, să fie o pagină separată în LDE, în care
-- drumurile se arată detaliat la fiecare mașină pe hartă». Urmele GPS stau pe VPS; pasul harta-zi.mjs din lanțul săptămânal
-- (drax/cod/saptamanal) scrie aici, pe mașină și zi, urma simplificată (15 m) tăiată pe intervalele «Ziua făcută, drum cu drum»,
-- opririle ≥ 5 min, casa și locurile nopții. Pagina /lde/harta citește un rând odată (≈ 20 KB), lista doar `sumar`.
-- Rerularea săptămânii șterge și rescrie rândurile ei. Casa șoferului și urmele sunt date personale: RLS fără politici,
-- doar service role (serverul panoului, după verifySession + ADMIN) le citește.

CREATE TABLE IF NOT EXISTS lde_harta_zi (
  uzina      text NOT NULL,
  saptamina  date NOT NULL,
  m          text NOT NULL,
  z          date NOT NULL,
  rulat_la   timestamptz NOT NULL DEFAULT now(),
  -- { dow, total, cuOameni, gol, economie, ideal, linii[] } — pentru lista mașinilor și a zilelor
  sumar      jsonb NOT NULL,
  -- { t00, casa, noapteA, noapteB, linii[], iv[{ora,t0,t1,tip,cats,km,de,pana,ocol,lin,prelungit,s[[lat,lon,sec]]}], stai[], zi, ideal }
  date       jsonb NOT NULL,
  PRIMARY KEY (uzina, saptamina, m, z)
);

COMMENT ON TABLE lde_harta_zi IS
  'Harta unei mașini pe o zi (ION-130): urma GPS simplificată pe intervale, opririle, casa, noaptea. Scrisă de '
  'drax/cod/saptamanal/harta-zi.mjs pe VPS, citită de /lde/harta. Un rând pe uzină, săptămână, mașină și zi.';

ALTER TABLE lde_harta_zi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_harta_zi FROM anon, authenticated;
