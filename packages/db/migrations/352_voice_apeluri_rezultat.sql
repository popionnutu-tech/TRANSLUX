-- 352_voice_apeluri_rezultat.sql
-- Ce s-a ales din fiecare apel al agentului vocal — temelia statisticii săptămânale.
--
-- Ion, 15.09: «am nevoie doar statistica săptămânală de sunete, câte sunete agentul
-- a dat în bară și nu a putut rezolva». Până acum fiecare apel pleca în Telegram ca
-- raport separat (≈180 pe săptămână), iar numărul pe care îl cere el nu exista
-- nicăieri: nici EL-ul nu-l are — `analysis.call_successful` scrie «success» la 174
-- din 175 de apeluri, inclusiv la cele în care clientul a închis fără răspuns.
--
-- Deci rezultatul apelului se citește din URME, nu din părerea modelului: ce tool-uri
-- au fost chemate, ce au întors și ce rând a rămas în tabelele de reclamații, lucruri
-- uitate și cereri de operator. Funcția stă în SQL, nu în TypeScript, ca să nu care
-- transcripturile (≈7,7 KB × 180 pe săptămână) prin rețea pentru o numărătoare.
--
-- Găleata `fara_tool` e singura pe care urmele NU o pot judeca: acolo intră și
-- «nu mergem la Iași» (răspuns corect din prompt, fără tool), și «alo?... alo?»
-- (clientul n-a spus nimic), și apelul în care clientul a cerut un loc la ultima
-- cursă, iar agentul n-a chemat nimic. Pe ea o desparte modelul, în lib/voice-weekly.ts.

create or replace function voice_apeluri_rezultat(p_from timestamptz, p_to timestamptz)
returns table (
  conversation_id text,
  created_at timestamptz,
  caller_phone text,
  duration_secs integer,
  summary text,
  bucket text
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select vc.conversation_id, vc.created_at, vc.caller_phone, vc.duration_secs,
           vc.summary, vc.transcript
    from voice_calls vc
    where vc.created_at >= p_from and vc.created_at < p_to
  ),
  turns as (
    select c.conversation_id as cid, t as turn
    from c cross join lateral jsonb_array_elements(coalesce(c.transcript, '[]'::jsonb)) t
  ),
  -- `result_value` e string JSON la EL, dar nu întotdeauna: tool-ul căzut întoarce
  -- text simplu («Invalid...»), iar un cast oarbă ar rupe toată statistica.
  rez as (
    select turns.cid,
           x->>'tool_name' as tool,
           case when left(btrim(coalesce(x->>'result_value', '')), 1) = '{'
                then (x->>'result_value')::jsonb end as rv
    from turns cross join lateral jsonb_array_elements(coalesce(turns.turn->'tool_results', '[]'::jsonb)) x
  ),
  f as (
    select c.conversation_id as cid, c.created_at as la, c.caller_phone as tel,
           c.duration_secs as durata, c.summary as rezumat,
           -- Replicile clientului: tăcerea totală nu e o ratare a agentului.
           (select count(*) from turns z
             where z.cid = c.conversation_id and z.turn->>'role' = 'user'
               and coalesce(z.turn->>'message', '') <> '') as replici_client,
           -- Rândurile din tabele, nu rezultatul tool-ului: `register_complaint`
           -- întoarce des `need_more` (agentul îl recheamă până culege tot), deci
           -- «a fost chemat» ≠ «reclamația s-a înregistrat».
           exists (select 1 from voice_callback_requests r where r.conversation_id = c.conversation_id) as a_cerut_operator,
           (select l.identified from voice_lost_items l where l.conversation_id = c.conversation_id) as obiect_identificat,
           exists (select 1 from voice_complaints k where k.conversation_id = c.conversation_id) as reclamatie,
           (select count(*) from rez
             where rez.cid = c.conversation_id
               and rez.tool in ('search_trips', 'get_price', 'get_schedule')) as cautari,
           (select count(*) from rez
             where rez.cid = c.conversation_id
               and rez.tool in ('search_trips', 'get_price', 'get_schedule')
               and (coalesce((rez.rv->>'count')::int, 0) > 0 or rez.rv->>'found' = 'true')) as cautari_cu_raspuns,
           exists (select 1 from rez where rez.cid = c.conversation_id and rez.rv ? 'unknown_locality') as localitate_nerecunoscuta
    from c
  )
  select f.cid, f.la, f.tel, f.durata, f.rezumat,
    case
      when f.replici_client = 0 then 'mut'
      when f.a_cerut_operator then 'operator'
      when f.obiect_identificat is true then 'lucru_uitat_gasit'
      when f.obiect_identificat is false then 'lucru_uitat_negasit'
      when f.reclamatie then 'reclamatie'
      when f.cautari_cu_raspuns > 0 then 'orar'
      -- Ordinea contează: o localitate nerecunoscută urmată de o căutare reușită
      -- (clientul a repetat numele) e un apel rezolvat, nu o ratare.
      when f.localitate_nerecunoscuta then 'localitate'
      when f.cautari > 0 then 'fara_curse'
      else 'fara_tool'
    end as bucket
  from f
  order by f.la;
$$;

comment on function voice_apeluri_rezultat(timestamptz, timestamptz) is
  'Rezultatul fiecărui apel al agentului vocal dintr-un interval, citit din urmele tool-urilor '
  'și din tabelele voice_complaints / voice_lost_items / voice_callback_requests. '
  'Găleți: mut, operator, lucru_uitat_gasit, lucru_uitat_negasit, reclamatie, orar, localitate, '
  'fara_curse, fara_tool (ultima se desparte cu modelul în lib/voice-weekly.ts). '
  'Sursa statisticii săptămânale din Telegram (Ion, 15.09).';

-- voice_calls și celelalte au RLS deny-all și se scriu doar cu service_role; funcția
-- e SECURITY DEFINER ca să citească peste politici, deci nu are ce căuta în /rest/v1/rpc
-- pentru anon/authenticated (linterul Supabase: *_security_definer_function_executable).
revoke execute on function public.voice_apeluri_rezultat(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.voice_apeluri_rezultat(timestamptz, timestamptz) to service_role;
