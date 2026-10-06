-- 392: Cod de bare generat pentru marfa care stă în magazin fără niciun cod.
--
-- Din 1 099 de piese active fără cod de bare, doar 11 au stoc — toate în magazin, toate bifate de vânzare,
-- 39 de bucăți în total, de la o pungă de 17 lei până la freon de 4 666. Celelalte 1 088 stau pe zero;
-- lor codul li se dă la recepție, când chiar intră marfa, nu acum în gol.
--
-- Unsprezece poziții pe care scanerul nu le putea găsi. Ceea ce explică și altceva: pe 24.09 Eduard a
-- deschis inventarierea cu scanare de două ori, la 41 de secunde una de alta, pe magazin și pe depozitul 2,
-- și n-a scanat nimic. O piesă fără cod nu se poate scana și nici nu lasă urmă că s-a încercat.
--
-- Codurile trec prin `piese_genereaza_cod()` (migr. 383) — EAN-13 cu prefixul „2", seria internă în care
-- magazinul are deja 4 374 de coduri — și prin `piese_set_part_barcodes`, nu direct în tabel: acolo e
-- marcajul de principal, oglinzile din `piese_parts` și garda de cod deja luat de altă piesă.
--
-- Fiecare generare lasă o linie în jurnal. Un cod de bare apărut din nimic pe o piesă veche e exact lucrul
-- despre care cineva va întreba peste o lună „de unde a venit asta?".
--
-- Verificat după aplicare: 11 coduri, toate de 13 cifre, toate începând cu 2, toate unice, cifra de control
-- EAN-13 recalculată independent — niciuna greșită. Un cod cu cifra de control greșită se tipărește la fel
-- de frumos și e respins de scaner abia la raft.
DO $$
DECLARE r record; v_cod text;
BEGIN
  FOR r IN
    SELECT p.id FROM piese_parts p
     WHERE p.active
       AND NOT EXISTS (SELECT 1 FROM piese_part_barcodes b WHERE b.part_id = p.id)
       AND EXISTS (SELECT 1 FROM piese_current_stock s
                    JOIN piese_warehouses w ON w.id = s.warehouse_id
                   WHERE s.part_id = p.id AND w.kind = 'SHOP' AND s.qty > 0)
     ORDER BY p.id
  LOOP
    v_cod := piese_genereaza_cod();
    PERFORM piese_set_part_barcodes(r.id, ARRAY[v_cod]);
    INSERT INTO piese_audit_log(user_id, admin_id, actor_label, action, entity, entity_id, detail)
    VALUES (NULL, NULL, 'migrație 392', 'BARCODE_GEN', 'part', r.id,
            format('Cod de bare intern generat: %s (piesă cu stoc în magazin, fără niciun cod)', v_cod));
  END LOOP;
END $$;
