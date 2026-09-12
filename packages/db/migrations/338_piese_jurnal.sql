-- 338: Jurnalul modulului, scos la suprafață.
--
-- Cerut de Mariana, 11.09: „sa vad tot jurnalul — doar administratorul".
--
-- Urma se scrie din 29.08 (migr. 291-293), dar nu era vizibilă nicăieri din aplicație: singurul loc unde
-- apărea era istoricul unui document de recepție, în modalul „✎ Modifică". Pentru eliberări, mutări,
-- anulări sau schimbări de preț nu exista niciun ecran — informația se putea citi doar cu acces direct la
-- bază. Adică exact persoana care are nevoie de ea, administratorul, era singura care n-o putea vedea.
--
-- ATENȚIE la ce NU acoperă jurnalul deocamdată: zece funcții din bază (recepție, corecție de recepție,
-- mutare trimisă/primită/anulată, inventariere, vânzare, marcare SFS, revizuire de cost) își scriu singure
-- urma cu `user_id`, coloana veche de tip bigint pentru utilizatorii Telegram, pe care aplicația o trimite
-- mereu NULL. Rândurile acelea apar cu autor necunoscut — și vor apărea așa și de acum înainte, nu doar
-- retroactiv. Nu e o graniță de dată, e una de cale de scriere.

-- Sortarea implicită a jurnalului e „cele mai noi întâi", peste tot tabelul — nu exista index pentru ea.
-- `id` în cheie ca departajare: două urme scrise în aceeași milisecundă trebuie să aibă o ordine stabilă,
-- altfel paginarea ar putea sări sau repeta un rând. Aceeași cheie servește și cursorul de mai jos.
CREATE INDEX IF NOT EXISTS idx_paudit_created ON piese_audit_log (created_at DESC, id DESC);

-- ── Fluxul jurnalului, filtrat ───────────────────────────────────────────────
-- Paginare pe POZIȚIE, nu pe număr de rânduri sărite. Jurnalul crește exact la capătul pe care îl răsfoim:
-- cu `OFFSET`, trei urme scrise între încărcarea paginii și apăsarea butonului „încă 50" fac ca ultimele
-- trei rânduri să reapară, iar altele să fie sărite — într-un ecran de audit, o urmă lipsă fără niciun semn
-- e chiar defectul pe care ecranul ar trebui să-l facă imposibil. Cursorul `(created_at, id)` e exact cheia
-- indexului de mai sus, deci nu costă nimic în plus.
--
-- `plan_cache_mode = force_custom_plan` NU e decorativ. Filtrele sunt scrise ca `p_x IS NULL OR coloană = p_x`,
-- formă care într-un plan GENERIC nu poate deveni condiție de index: rămâne filtru pe fiecare rând, iar
-- căutarea după un autor cu douăzeci de urme ar parcurge tot jurnalul. Cu plan custom, `p_x IS NULL` se
-- pliază la o constantă, condiția rămâne singură și planificatorul poate folosi `idx_paudit_admin`. Funcția
-- oricum nu e inline-abilă (are `SET search_path`), deci nu se pierde nimic.
DROP FUNCTION IF EXISTS piese_audit_feed(date, date, uuid, text, text, text, int, int);

CREATE OR REPLACE FUNCTION piese_audit_feed(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_admin uuid DEFAULT NULL,
  p_entity text DEFAULT NULL, p_action text DEFAULT NULL, p_q text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_after_at timestamptz DEFAULT NULL, p_after_id bigint DEFAULT NULL
) RETURNS TABLE(
  id bigint, created_at timestamptz, action text, entity text, entity_id bigint,
  subject_id text, admin_id uuid, actor_label text, detail text,
  before_data jsonb, after_data jsonb
) LANGUAGE sql STABLE
SET search_path = public, pg_temp
SET plan_cache_mode = 'force_custom_plan'
AS $$
  SELECT l.id, l.created_at, l.action, l.entity, l.entity_id, l.subject_id, l.admin_id,
         -- Rândurile de dinainte de migr. 293 n-au etichetă fotografiată; pentru ele o rezolvăm acum, din
         -- cont. `NULLIF(a.name,'')` fiindcă un nume gol e absență, nu autor — la fel ca în TypeScript.
         COALESCE(l.actor_label, NULLIF(a.name, ''), NULLIF(split_part(COALESCE(a.email, ''), '@', 1), '')) AS actor_label,
         l.detail, l.before_data, l.after_data
    FROM piese_audit_log l
    LEFT JOIN admin_accounts a ON a.id = l.admin_id
   WHERE (p_from   IS NULL OR l.created_at >= (p_from::timestamp AT TIME ZONE 'Europe/Chisinau'))
     AND (p_to     IS NULL OR l.created_at <  ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Chisinau'))
     AND (p_admin  IS NULL OR l.admin_id = p_admin)
     AND (p_entity IS NULL OR l.entity = p_entity)
     AND (p_action IS NULL OR l.action = p_action)
     -- Căutarea acoperă ȘI starea, nu doar nota. Rândurile scrise de aplicație au `detail` gol și tot
     -- înțelesul în `before_data`/`after_data`; căutând doar în `detail`, caseta n-ar fi găsit niciodată
     -- nimic tocmai despre acțiunile care au autor.
     AND (p_q IS NULL OR btrim(p_q) = ''
          OR COALESCE(l.detail, '') || ' ' || COALESCE(l.before_data::text, '') || ' '
             || COALESCE(l.after_data::text, '') ILIKE '%' || btrim(p_q) || '%')
     AND (p_after_at IS NULL OR p_after_id IS NULL
          OR (l.created_at, l.id) < (p_after_at, p_after_id))
   ORDER BY l.created_at DESC, l.id DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION piese_audit_feed(date, date, uuid, text, text, text, int, timestamptz, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_audit_feed(date, date, uuid, text, text, text, int, timestamptz, bigint) TO service_role;

-- ── Cine apare în jurnal ─────────────────────────────────────────────────────
-- Lista pentru filtrul „autor". Se ia DIN JURNAL, nu din lista de conturi: cine n-a făcut nimic n-are ce
-- căuta în filtru, iar cine a făcut ceva și între timp a fost șters trebuie să rămână acolo — altfel exact
-- urmele care merită căutate ar deveni imposibil de filtrat.
--
-- Eticheta e cea mai RECENTĂ, nu `max()` alfabetic: migr. 293 fotografiază numele tocmai ca redenumirile să
-- se păstreze, iar `max()` ar fi ales arbitrar dintre variantele istorice.
CREATE OR REPLACE FUNCTION piese_audit_actors()
RETURNS TABLE(admin_id uuid, label text) LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT d.admin_id,
         COALESCE(
           (SELECT l2.actor_label FROM piese_audit_log l2
             WHERE l2.admin_id = d.admin_id AND l2.actor_label IS NOT NULL
             ORDER BY l2.created_at DESC, l2.id DESC LIMIT 1),
           NULLIF(a.name, ''),
           NULLIF(split_part(COALESCE(a.email, ''), '@', 1), ''),
           '(cont șters)') AS label
    FROM (SELECT DISTINCT l.admin_id FROM piese_audit_log l WHERE l.admin_id IS NOT NULL) d
    LEFT JOIN admin_accounts a ON a.id = d.admin_id
   ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION piese_audit_actors() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_audit_actors() TO service_role;

-- ── Ce tipuri de urme există ─────────────────────────────────────────────────
-- Tot din jurnal, din același motiv: o listă scrisă de mână în cod ar rămâne în urmă la prima acțiune nouă,
-- iar filtrul ar ascunde tăcut tocmai ce s-a adăugat ultima dată. Rezultatul se ține în cache o oră în
-- aplicație — conținutul se schimbă doar când apare un cod de acțiune nou, adică rar.
CREATE OR REPLACE FUNCTION piese_audit_kinds()
RETURNS TABLE(entity text, action text) LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT l.entity, l.action
    FROM piese_audit_log l
   ORDER BY l.entity NULLS LAST, l.action;
$$;

REVOKE ALL ON FUNCTION piese_audit_kinds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_audit_kinds() TO service_role;
