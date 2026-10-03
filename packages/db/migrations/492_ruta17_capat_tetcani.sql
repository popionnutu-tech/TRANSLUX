-- 492: ruta 17 «Criva (Tețcani) – Chișinău» începe și se termină la Tețcani (ION-212)
--
-- Ion, 03.10: «Turul 2:40 returul 13:55, tur retur începând cu Tețcani».
-- GPS (route_stop_passes, 13.09–02.10, 20 de zile): turul pornește din Corjeuți pe la 04:03,
-- prin Criva, Drepcăuți, Lipcani, Șirăuți, Slobozia Șirăuți și Pererita n-a trecut niciodată;
-- returul se termină în Corjeuți pe la 18:15. Capătul ales de Ion: Tețcani.
--
-- Site-ul, asistentul și Graficul iau opririle din crm_stop_fares, deci opririle de dinainte
-- de Tețcani se scot (nu le referă nimic: route_check_stop_changes are 0 rânduri pe ele).
-- Numărarea pornește de la interurban_v2_routes.start_stop_order: Tețcani = 8 în tariful 2.


DO $$
BEGIN
  IF (SELECT count(*) FROM crm_stop_fares
       WHERE crm_route_id = 17 AND id BETWEEN 644 AND 649 AND stop_order < 70) <> 6 THEN
    RAISE EXCEPTION 'ruta 17: opririle 644–649 nu mai sunt cele așteptate (Criva → Pererita)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM crm_stop_fares
                  WHERE crm_route_id = 17 AND id = 650 AND name_ro = 'Tețcani'
                    AND hour_from_nord = '03:40' AND hour_from_chisinau = '18:10') THEN
    RAISE EXCEPTION 'ruta 17: Tețcani (650) nu are orele 03:40 / 18:10';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM interurban_v2_stops
                  WHERE tariff_id = 2 AND stop_order = 8 AND name_ro = 'Tețcani') THEN
    RAISE EXCEPTION 'tariful 2: oprirea 8 nu e Tețcani';
  END IF;
END $$;

DELETE FROM crm_stop_fares WHERE crm_route_id = 17 AND id BETWEEN 644 AND 649;

UPDATE crm_routes SET
  dest_from_ro  = 'Tețcani - Chișinău',
  dest_from_ru  = 'Тецканы - Кишинёв',
  dest_to_ro    = 'Chișinău - Tețcani',
  dest_to_ru    = 'Кишинёв - Тецканы',
  time_nord     = '03:40 - 08:20',
  time_chisinau = '13:55 - 18:10'
WHERE id = 17;

UPDATE interurban_v2_routes SET
  name_ro          = 'Tețcani - Chișinău',
  time_nord        = '03:40 - 08:20',
  time_chisinau    = '13:55 - 18:10',
  start_stop_order = 8,
  updated_at       = now()
WHERE id = 15 AND crm_route_id = 17;

