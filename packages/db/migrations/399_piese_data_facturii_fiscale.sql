-- 399: Data facturii fiscale, separată de data intrării în depozit.
--
-- Eduard, 08.10: «piesele vin pe facturi interne, pe urmă vine o factură fiscală pentru 1C cu seria și
-- numărul și data — asta poate fi o dată pe zi sau o dată pe săptămână».
--
-- Sunt DOUĂ date, iar până acum le-am ținut pe amândouă într-una singură:
--
--   `created_at`   — când marfa a ajuns fizic pe raft. Din ea se construiește ordinea FIFO, adică ce strat
--                    se consumă primul și la ce cost. Nu se atinge NICIODATĂ: o recepție mutată în urmă se
--                    bagă înaintea unora deja consumate, iar costurile ieșirilor de după devin altele decât
--                    cele scrise deja în documentele plecate.
--   `invoice_date` — data documentului fiscal, care vine DUPĂ marfă. Nu mișcă stoc, nu schimbă niciun cost,
--                    nu atinge FIFO. Poate fi corectată oricând.
--
-- De aici vine și regula de drepturi, pusă în `actions.ts`: seria, numărul și data facturii se pot corecta
-- ȘI în afara ferestrei de corecție, fiindcă nu pot strica registrul. Tot restul — furnizor, total de
-- control, comentariu, linii — rămâne sub fereastră. Altfel regula s-ar bate cap în cap cu realitatea:
-- Eduard are fereastră de o zi, iar factura vine peste o săptămână, adică exact când n-ar mai avea voie.
--
-- A DOUA consecință, pe care n-o ceruse nimeni dar o repară: exportul către 1C trimitea ca dată a
-- documentului `created_at`, adică ziua în care s-a introdus marfa. Pentru contabilitate e greșit —
-- documentul din 1C trebuie să poarte data facturii fiscale. Pe proba de ieri nu s-a văzut, fiindcă era o
-- casare; la prima recepție exportată ar fi ieșit la iveală. Exportul ia acum `invoice_date`, cu
-- `created_at` ca rezervă pentru documentele vechi și pentru cele fără factură încă.
ALTER TABLE piese_stock_documents ADD COLUMN IF NOT EXISTS invoice_date date;

COMMENT ON COLUMN piese_stock_documents.invoice_date IS
  'Data facturii fiscale, care vine DUPĂ marfă (o zi sau o săptămână). Nu are legătură cu created_at — acela e momentul intrării fizice în depozit și decide ordinea FIFO. Aceasta e dată contabilă: se trimite în 1C și se poate corecta în afara ferestrei de corecție, fiindcă nu mișcă stoc.';
