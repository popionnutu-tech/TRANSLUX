-- 357_pret_anunt_grupa.sql
-- Anunțul cu prețurile noi în grupă: o propunere de tarif = un anunț.
--
-- Ion, 15.09: «fiecare joi când se face update la prețuri — noile prețuri în formă
-- imagini cu principalele locații schimbare preț; și se spune: pentru informație
-- adițională vizitați site-ul».
--
-- Anunțul pleacă din applyProposal, adică exact când tariful e confirmat (automat
-- joi seara sau din panou). Calea aia e apelată și de cronul de joi, și de butonul
-- din panou, iar cronul are o plasă de siguranță care o poate rechema — fără un
-- semn în rând, aceeași săptămână ar ajunge de două ori în grupă.
--
-- Semnul stă pe propunere, nu într-o tabelă nouă: anunțul E o proprietate a
-- propunerii (când a plecat), și moare odată cu ea dacă e ștearsă vreodată.
-- Scris DUPĂ trimiterea confirmată de Telegram — un Telegram căzut se reîncearcă
-- la următoarea rulare, nu rămâne mut pentru totdeauna.

alter table pending_price_updates add column if not exists announced_at timestamptz;

comment on column pending_price_updates.announced_at is
  'Când a plecat în grupa șoferilor imaginea cu prețurile noi (lib/price-announce.ts). '
  'NULL = încă nu a plecat. Paza contra dublurii: se scrie doar după ce Telegram a primit imaginea.';
