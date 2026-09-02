-- ============================================================================
-- Apelul mixt: reclamă ȘI a uitat ceva (02.09.2026)
--
-- Regula lui Ion din 01.09: reclamantul NU află pe cine s-a identificat. Dar
-- fluxul lucrurilor uitate îi dă clientului numărul personal al șoferului, iar
-- un apel poate fi și una, și alta. Rezultatul, până acum: omul reclamat primea
-- telefonul celui care tocmai l-a acuzat — singurul loc din tot fluxul unde asta
-- se întâmpla. Grupa șoferilor l-ar fi și anunțat public că urmează apelul.
--
-- Decizia lui Ion (02.09): la reclamație pe același apel, numărul NU se dă.
-- Obiectul se recuperează prin birou.
--
-- Coloana ține minte asta pentru mesajul din grupă: fără ea, șoferul ar citi
-- «Clientul are numărul și sună direct» și ar aștepta un telefon care nu vine.
-- ============================================================================
BEGIN;

ALTER TABLE voice_lost_items
  ADD COLUMN IF NOT EXISTS phone_withheld boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN voice_lost_items.phone_withheld IS 'true = pe acelasi apel exista o reclamatie, deci clientul NU a primit numarul soferului (regula lui Ion din 01.09: reclamantul nu afla pe cine s-a identificat). Obiectul se recupereaza prin birou, iar mesajul din grupa nu promite un telefon care nu vine.';

COMMIT;
