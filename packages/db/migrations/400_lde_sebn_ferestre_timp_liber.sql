-- 400: SEBN Orhei și Strășeni intră în detectorul de timp liber și brambura (ION-60)
--
-- Ion, 25.09.2026, pe lista «Km neagreați (brambura)» de pe /lde/reguli?uz=sebn: «aplică ultima regulă
-- km liberi de la Ungheni LEAR aici». sebn-liber.mjs rulează lunea (lear-saptamanal.sh) cu modulul
-- LEAR lear-timp-liber.mjs; îi trebuie ferestrele de ceas ale uzinei și §11 în regula livrării.
--
-- Ferestrele sunt cele cu care s-a tăiat scheletul SEBN (sebn/cod/etalon.mjs, FER), verificate pe
-- urma GPS 15.06–24.09.2026: 83 de perechi schimb, tur = retur cu diferența mediană 1%. SEBN are trei
-- schimburi (06:00 / 14:30 / 23:00), iar predarea se face pe loc. Cursele ADM (sosire ~08:00, plecare
-- ~17:00) nu au fereastră proprie — tabelul primește doar schimburile 1–3 — deci fereastra schimbului 1
-- e lărgită să le cuprindă: la SEBN orice atingere a porții 03:30–09:30 e muncă oricum (sosirea
-- schimbului 1, plecarea schimbului 3 la 06:00, ADM la 08:00).

INSERT INTO lde_uzina_ferestre_ceas (uzina_id, sens, shift_number, de_la_min, pana_la_min, sursa)
SELECT u.id, f.sens, f.sch, f.de, f.pana, 'GPS 15.06–24.09.2026 (etalon SEBN) + ADM'
FROM (VALUES ('SEBN_ORHEI'), ('SEBN_STRASENI')) AS u(id)
CROSS JOIN (VALUES
  ('tur',   1,  210,  570),   -- sosire 03:30–09:30 (schimbul 1 + ADM 08:00)
  ('tur',   2,  720,  900),   -- sosire 12:00–15:00
  ('tur',   3, 1230, 1410),   -- sosire 20:30–23:30
  ('retur', 1,  840, 1170),   -- plecare 14:00–19:30 (schimbul 1 + ADM 17:00)
  ('retur', 2, 1350,  150),   -- plecare 22:30–02:30
  ('retur', 3,  330,  510)    -- plecare 05:30–08:30
) AS f(sens, sch, de, pana)
ON CONFLICT DO NOTHING;

-- §11 în regula livrării SEBN (scrisă pe 25.09 pe /lde/livrare-reguli), în forma celei de la LEAR
UPDATE lde_uzine SET reguli_livrare_la = now(), reguli_livrare = reguli_livrare || $s11$

11. TIMP LIBER ȘI BRAMBURA (Ion, 25.09: «aplică ultima regulă km liberi de la Ungheni LEAR aici»; raportul săptămânal, luni 08:00)
11.1 Munca e un LANȚ, nu o cursă: ancora = atingerea porții SEBN (Orhei sau Strășeni) cu sosirea într-o fereastră de tur sau plecarea într-o fereastră de retur (3.2; fereastra schimbului 1 cuprinde și ADM). SEBN lucrează toată săptămâna. Lanțul cuprinde cursele legate de ancoră înapoi și înainte cât timp pauza dintre ele e sub 2 h (pauza la poartă sau la parc nu rupe), până mașina ajunge acasă și stă. Tot ce e în lanț e muncă, inclusiv drumul de acasă până la satul de start (livrarea).
11.2 Cursa care atinge poarta SEBN în orele schimbului e MUNCĂ oricare ar fi drumul. Nu e niciodată brambura.
11.3 BRAMBURA = km din cursele lanțului care NU ating poarta (de acasă până la primul sat, de la ultimul sat acasă) făcuți pe un drum pe care mașina n-a mers în nicio altă zi a săptămânii. Drumul obișnuit = o bucată de ~500 m trecută în ≥ 2 zile. Se numără doar ≥ 5 km pe cursă. Drumul zilnic de acasă (Chiperceni → Vatici la 552BRAO) NU e brambura: e livrare.
11.4 REPARAȚIE = orice oprire la depozitul din Bălți (rază 0,5 km); nu apare ca muncă, liber sau brambura.
11.5 ALTĂ UZINĂ = cursa oprește la poarta altei uzine din baza porților (Drăxlmaier, LEAR, Trox). Porțile SEBN Orhei și SEBN Strășeni sunt aceeași firmă: una nu e «altă uzină» pentru cealaltă.
11.6 NAVETĂ = drumul între două case ale mașinii; a doua casă acoperă o noapte (≥ 6 h peste 00:00–05:00, în ≥ 2 nopți).
11.7 TIMP LIBER = cursă fără nicio legătură cu poarta SEBN, care nu e reparație, altă uzină sau navetă. Se arată ziua, de unde → unde (cu opririle ≥ 2 min) → înapoi și între ce drumuri la poartă; «se repetă» dacă locul apare în alte zile.
11.8 NECLAR = gol de semnal cu deplasare, trecere prin zona parcului fără oprire, cursă neterminată la marginea datelor.
11.9 Liber și brambura se numără SEPARAT, fiecare cu steag la 50 km pe săptămână pe mașină.
11.10 Flota se ia din urmă: mașinile LDE care au STAT la poarta SEBN ≥ 4 zile în săptămână. Interurbanele Chișinău–nord trec zilnic pe lângă poarta Orhei și nu intră.
11.11 Modulul e același ca la LEAR (lear-timp-liber.mjs); SEBN are doar workerul lui, sebn-liber.mjs.$s11$
WHERE id IN ('SEBN_ORHEI', 'SEBN_STRASENI') AND reguli_livrare IS NOT NULL AND position('11. TIMP LIBER' IN reguli_livrare) = 0;
