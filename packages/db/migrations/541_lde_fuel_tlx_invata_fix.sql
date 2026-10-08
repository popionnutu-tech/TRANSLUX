-- 541: în lde_fuel_tlx_invata_qr (migr. 540) variabila «n» se bătea cu coloana «n» din CTE → «column reference "n" is ambiguous».

CREATE OR REPLACE FUNCTION lde_fuel_tlx_invata_qr(p_pana date) RETURNS integer
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  WITH m AS (
    SELECT r.cod, f.vehicle_id, count(*) AS n
    FROM lde_fuel_import_rand r
    JOIN LATERAL (SELECT DISTINCT f2.vehicle_id FROM lde_fuel_foaie f2
                  WHERE abs(f2.litri - r.litri) < 0.02 AND f2.zi BETWEEN r.zi_local - 1 AND r.zi_local + 1
                    AND 'tlx' = ANY (lde_fuel_foaie_surse(f2.foaie))) f ON true
    WHERE r.sursa = 'tlx' AND r.este_dt AND r.zi_local BETWEEN p_pana - 60 AND p_pana AND lde_fuel_rand_activ(r.external_id)
    GROUP BY 1, 2),
  tot AS (SELECT cod, sum(n) AS t FROM m GROUP BY 1),
  dom AS (SELECT DISTINCT ON (m.cod) m.cod, m.vehicle_id, m.n, tot.t FROM m JOIN tot USING (cod) ORDER BY m.cod, m.n DESC)
  UPDATE lde_fuel_portofel p SET vehicle_id = dom.vehicle_id,
    legat_de = 'tlx-qr-worker (după foaia LDE: ' || dom.n || ' din ' || dom.t || ')', legat_la = now()
  FROM dom
  WHERE p.sursa = 'tlx' AND p.cod = dom.cod AND p.tip = 'masina' AND p.legat_de LIKE 'tlx-qr-worker%'
    AND dom.n >= 3 AND dom.n >= 0.6 * dom.t AND p.vehicle_id IS DISTINCT FROM dom.vehicle_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION lde_fuel_tlx_invata_qr(date) FROM PUBLIC, anon, authenticated;
