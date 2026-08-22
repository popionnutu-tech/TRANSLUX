-- 261: ruta 6 (Corjeuți - Chișinău 06:17) folosea tariful greșit pe site
--
-- Problema: crm_routes.tariff_id_tur=98 / tariff_id_retur=116 → tarif v2 «Criva via Corjeuți»,
-- care merge Corjeuți → Caracușeni → Tabani → Briceni → Halahora → Hlinaia → Edineț.
-- Ruta 6 merge de fapt Corjeuți → Trinca → Tîrnova → Gordineștii Noi → Edineț
-- (confirmat de counting_entries: Trinca 484 pasageri, Gordineștii Noi 1325 în 57 curse).
-- numărare folosea deja tariful corect — «Corjeuti/Edinet» (interurban_v2_routes.tariff_id=6).
--
-- Efect: căutarea publică nu găsea perechea km pentru Trinca/Tîrnova/Gordineștii Noi
-- și ascundea cursa (actions.ts: `if (!priceMap.has(tariffId)) continue`).

UPDATE crm_routes
SET tariff_id_tur = 115,   -- era 98  (v2 tarif 2 «Criva via Corjeuți»)
    tariff_id_retur = 114  -- era 116 (v2 tarif 2 «Criva via Corjeuți»)
WHERE id = 6;
