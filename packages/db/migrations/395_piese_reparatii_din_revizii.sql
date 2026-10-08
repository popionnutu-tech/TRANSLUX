-- 395: Reparațiile din cele trei revizii (securitate, arhitectură, performanță) pe migr. 384-394.
--
-- ── 1. Drepturi pe funcțiile noi ──
-- Proiectul are `ALTER DEFAULT PRIVILEGES` care acordă EXECUTE pe ORICE funcție nouă din `public` direct
-- lui `anon` și `authenticated` (vezi migr. 289). Orice funcție nouă trebuie deci să-și revoce explicit
-- drepturile, altfel e apelabilă prin PostgREST, pe lângă toate gărzile aplicației.
--
-- Verificat în producție înainte de reparație: `piese_nume_bon` și `piese_nume_bon_propus` chiar erau
-- apelabile de `anon` și `authenticated`. Scurgere efectivă n-a fost — prima e SECURITY INVOKER și citește
-- `piese_parts`, care are RLS activ fără nicio politică (deci pentru `anon` întoarce gol), iar a doua e
-- pură, nu atinge date. Dar convenția modulului e revocarea, nu norocul.
--
-- `piese_create_sale` (12 parametri), `piese_pret_candidat` și `piese_cec` erau deja revocate — au păstrat
-- drepturile de la migrațiile care le-au creat prima dată, fiindcă semnătura n-a fost schimbată.
REVOKE ALL ON FUNCTION piese_nume_bon_propus(text,text,text,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_nume_bon_propus(text,text,text,int) TO service_role;
REVOKE ALL ON FUNCTION piese_nume_bon(bigint,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_nume_bon(bigint,int) TO service_role;

-- ── 2. Cota TVA nu mai poate ieși din 0–100 ──
-- `piese_cec` calculează `suma × cotă / (100 + cotă)`. O cotă de -100 împarte la zero, iar funcția aruncă:
-- cecul nu s-ar mai putea tipări pentru NICIUN document care conține piesa. Iar o cotă de 8 pusă din
-- greșeală nu rupe nimic — doar declară altă taxă decât cea datorată, pe o hârtie care ajunge la client.
-- Atributele `min`/`max` din formular sunt o sugestie a browserului; garda trebuie să fie aici.
ALTER TABLE piese_parts
  ADD CONSTRAINT piese_parts_tva_cota_ck CHECK (tva_cota >= 0 AND tva_cota <= 100) NOT VALID;
ALTER TABLE piese_parts VALIDATE CONSTRAINT piese_parts_tva_cota_ck;

-- ── 3. Lista din care se VINDE folosea altă formulă decât eticheta ──
-- Migr. 391 a adus eticheta și Căutarea pe prețul memorat, cu rezervă calculată. Dar `piese_sale_parts` —
-- lista ecranului Magazin, adică exact locul unde se iau banii — a rămas pe `COALESCE(p.sale_price, 0)`.
--
-- Măsurat la descoperire: 8 piese bifate de vânzare aveau preț 0 în lista magazinului, 3 dintre ele cu
-- marfă pe raft. Prețul 0 se prefilează pe linia de vânzare și trece, fiindcă `piese_cost_ok` admite zero
-- (deliberat — se mai dă o piesă fără bani). Deci marfa putea pleca gratis, cu o etichetă de preț pe ea.
--
-- Cum ajunge o piesă în starea asta: cricul de preț (migr. 368) se declanșează doar pe RECEIPT, TRANSFER_IN
-- și DONOR_IN. Marfa intrată prin ADJUST_PLUS — corecție de stoc, inventariere, sold inițial — nu primește
-- niciodată preț, deși FIFO-ul o lasă să se vândă. Asta contează imediat: încărcarea stocului de magazin
-- din IntelectSoft (3 314 poziții) se face tocmai ca ADJUST_PLUS, deci ar fi produs 3 314 piese vandabile
-- la 0 lei. Prețurile pentru ele se pun într-un pas separat și deliberat, nu din trigger.
CREATE OR REPLACE VIEW piese_sale_parts AS
 SELECT p.id,
    g.name_ro AS grp,
    p.manufacturer,
    p.model,
    COALESCE(p.markup_pct, g.markup_pct) AS markup_pct,
    COALESCE(p.sale_price,
             piese_pret_candidat(p.id, (
               SELECT COALESCE(avg(m.unit_cost), 0) FROM piese_stock_movements m
                WHERE m.part_id = p.id AND m.movement_type = 'RECEIPT' AND m.unit_cost > 0
                  AND NOT EXISTS (SELECT 1 FROM piese_stock_documents dd
                                   WHERE dd.id = m.document_id AND dd.status = 'CANCELLED'))),
             0::numeric) AS price,
    p.sale_price_at,
    p.sale_price_sursa,
    p.name_ro, p.name_long, p.article_code, p.oem_code, p.barcodes_all, p.is_used
   FROM piese_parts p
     JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.is_for_sale AND p.active
  ORDER BY g.name_ro;

-- După aliniere: 0 nepotriviri între lista magazinului și eticheta de pe raft (erau 1), iar cele 7 poziții
-- rămase pe 0 sunt cele care n-au NICIO intrare cu cost, deci n-au de unde primi preț. Trei dintre ele au
-- marfă pe raft și cer o decizie de om, nu o formulă: #4093 «Колодки зад. E220», #4170 «Колодки перед
-- ДАЧИЯ Бельцы», #4198 «Колодки ручника 412».
