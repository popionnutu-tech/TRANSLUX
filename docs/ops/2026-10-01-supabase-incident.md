# Incident 01.10.2026: baza Supabase încremenită 19:33–20:20

## Ce s-a văzut

- 19:33:01 prima cerere lentă (`tariff_periods`, 29 s); în 40 s toate cererile 200+ s; până la 20:20 100 % erori 504.
- Supabase «Unhealthy» pe Database, PostgREST, Auth, Realtime, Storage. Site-ul translux.md fără căutare, botul și
  panoul fără bază.
- Nu a fost atac: 5–8 IP-uri, toate ale noastre, trafic în scădere.
- Nicio interogare de-a noastră nu rula în momentul căderii.
- 20:18 Ion a dat Restart project; baza a pornit la 20:20:27 cu «database system was not properly shut down»
  (statisticile `pg_stat_*` s-au resetat).

## Ce dusese baza în ziua aceea

Trei ferestre de scriere grea: 15:00–15:31, 16:11–16:56, 17:47–18:11 — importul istoric Mobilet (ION-160),
migrațiile 452–460, `tiki_refacere_pas` apelat de 145 de ori × 17–87 s, `count_aggr_days`, checkpoint-uri de 5–12 mii de
pagini.

## Cauza

Declanșatorul exact de la 19:33 nu e dovedit: memoria / swap pe 0,5 GB sau bugetul de disc al instanței NANO după
scrierile de peste zi. Ambele duc la aceeași concluzie: NANO nu duce munca grea ziua.

## Ce s-a schimbat (ION-166, 02.10)

- Refacerea Bilete aparat e împărțită în pași mici (migr. 463–465): atribuire pe ~7 zile, etichetă, km pe ~7 zile,
  agregate pe ~7 zile, Numărarea ≤ 15 s pe pas. Măsurat pe 08.2026 (29.921 de bilete) și 11.2025: pasul cel mai lung 8,2 s
  (înainte un pas lunar dura 17–87 s), rezultatul identic cu vechiul calcul pe bilete, lei, km.
- Refacerea rulează doar 23:00–05:00 Chișinău (ziua doar cu `?force=1`); importul Mobilet s-a mutat la 03:30.
- Triggerele Numărării nu mai așteaptă după pasul de refacere (migr. 461–462, ION-167): înainte o salvare în GO putea
  sta ~70 s în timpul refacerii de dimineață.
- Pagina Bilete aparat arată ce lună așteaptă recalculul; regulile pentru zi / noapte: `supabase-nano.md`.
