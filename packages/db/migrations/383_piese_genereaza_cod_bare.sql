-- 383: Generarea unui cod de bare intern.
--
-- Cerere Eduard (25.09): la „Editează piesa" din Prihod, un buton care generează codul — multe piese vin
-- fără cod pe ambalaj, iar fără cod nu pot fi scanate nici la inventariere, nici la vânzare.
--
-- Format: EAN-13 care începe cu „2". Nu e o alegere nouă — e seria pe care o folosesc deja: din cele
-- ~9600 de coduri din bază, peste 4300 încep cu 2. Deci noile coduri se citesc cu aceleași scanere și se
-- tipăresc pe aceleași etichete, fără nicio schimbare la depozit.
--
-- „2" e prefixul rezervat prin standard pentru uz INTERN: nu se ciocnește niciodată cu un cod de
-- producător, fiindcă niciun producător nu primește prefixul acela.
--
-- Cifra de control se calculează, nu se inventează: un EAN-13 fără ea e respins de scaner, iar omul ar
-- vedea doar „nu citește", fără să afle de ce.
CREATE OR REPLACE FUNCTION piese_genereaza_cod()
RETURNS text LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE baza text; cod text; s int; i int; c int; incercari int := 0;
BEGIN
  LOOP
    incercari := incercari + 1;
    -- 12 cifre: „2" + 11 aleatoare. Aleator, nu secvențial: un contor ar cere un rând de stare și s-ar
    -- bloca la două recepții în paralel, iar spațiul de 10^11 face ciocnirea practic imposibilă.
    baza := '2' || lpad(floor(random() * 100000000000)::bigint::text, 11, '0');

    -- Cifra de control EAN-13: cifrele de pe pozițiile pare (de la stânga, 1-based) se înmulțesc cu 3.
    s := 0;
    FOR i IN 1..12 LOOP
      c := substr(baza, i, 1)::int;
      s := s + CASE WHEN i % 2 = 0 THEN c * 3 ELSE c END;
    END LOOP;
    cod := baza || ((10 - (s % 10)) % 10)::text;

    -- Unicitatea se verifică în bază, nu se presupune din aleator.
    PERFORM 1 FROM piese_part_barcodes WHERE lower(barcode) = cod;
    IF NOT FOUND THEN RETURN cod; END IF;

    IF incercari > 50 THEN RAISE EXCEPTION 'NU_POT_GENERA'; END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION piese_genereaza_cod() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_genereaza_cod() TO service_role;
