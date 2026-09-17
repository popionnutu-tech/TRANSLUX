-- 362: Reparație la 361 — o dublură pe care am creat-o singură.
--
-- În 361, verificarea „mașina există deja?" compara numărul NORMALIZAT din parc cu `plate` AȘA CUM E
-- STOCAT. Un rând vechi scris „692 TWK", cu spațiu, n-a fost găsit — și s-a inserat „692TWK" alături.
-- Două rânduri pentru aceeași mașină, într-un tabel unde `plate` e unic tocmai ca asta să nu se întâmple.
--
-- Prinsă imediat, la reluarea potrivirii cu 1C: acolo a ieșit ca „mai multe la noi". Fără pasul acela ar
-- fi trăit până când cineva ar fi eliberat piese pe mașina greșită dintre cele două.
--
-- Rândul nou (fără nicio mișcare) se șterge; cel vechi (cu istoric) se păstrează și i se normalizează
-- numărul. Ordinea contează: ștergem întâi, altfel normalizarea ar lovi indicele unic.
DELETE FROM piese_vehicles v
 WHERE v.plate = '692TWK'
   AND NOT EXISTS (SELECT 1 FROM piese_stock_movements m WHERE m.vehicle_id = v.id)
   AND NOT EXISTS (SELECT 1 FROM piese_stock_documents d WHERE d.vehicle_id = v.id)
   AND EXISTS (SELECT 1 FROM piese_vehicles o WHERE o.plate = '692 TWK');

-- Normalizarea tuturor numerelor: majuscule, fără spații și cratime. De acum „459 BRAX" și „459BRAX" nu
-- mai pot coexista, iar potrivirea cu 1C (care scrie „458 BRAX") se face pe aceeași formă.
UPDATE piese_vehicles
   SET plate = upper(replace(replace(btrim(plate), ' ', ''), '-', ''))
 WHERE plate <> upper(replace(replace(btrim(plate), ' ', ''), '-', ''));
