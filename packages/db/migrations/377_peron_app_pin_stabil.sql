-- 377: codul de conectare al aplicației de peron devine PIN permanent al operatorului
--
-- Ion (18.09.2026): «la apk operator peron, să nu se schimbe PIN-urile».
-- Până acum codul avea 6 cifre, 24 h și o singură folosire: la fiecare 401 (telefon
-- nou, reinstalare, sesiune revocată) operatorul cerea adminului alt cod, iar un
-- operator a ajuns la cinci coduri în zece zile. De acum: UN cod pe operator, fără
-- termen, refolosibil ori de câte ori aplicația cere conectarea. `used_at` devine
-- «ultima folosire». Botul mai respectă `expires_at` doar dacă e completat (nu mai e).

alter table peron_app_link_codes alter column expires_at drop not null;

-- Un singur cod pe operator: rămâne cel tastat cel mai recent (operatorul îl știe),
-- altfel cel mai nou generat. Restul erau coduri expirate sau nefolosite.
delete from peron_app_link_codes c
 where c.code <> (
   select x.code
     from peron_app_link_codes x
    where x.user_id = c.user_id
    order by x.used_at desc nulls last, x.created_at desc
    limit 1
 );

update peron_app_link_codes set expires_at = null where expires_at is not null;

create unique index if not exists peron_app_link_codes_user_uidx
  on peron_app_link_codes (user_id);

comment on table peron_app_link_codes is
  'PIN-ul permanent al operatorului de peron pentru aplicația Android: 6 cifre, un cod pe operator, fără termen, refolosibil; used_at = ultima conectare. Se schimbă doar la cererea explicită a proprietarului (migr. 377).';
