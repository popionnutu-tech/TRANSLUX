# Runda 3 (finală) — convergență

Ambele părți au citit rundele 1–2. Faptele convenite în runda 2 (nu se mai re-deschid fără dovadă nouă): SQL 445 e mai slab decât
variantele pe zi; norma de pe poster include luna judecată (lookahead, cod combustibil-poster.ts:109); P90 trebuie pe totalul zilei;
8 vehicule fără km (8.906 l, 01.07–27.09); rezervorul virtual 9.920 l era umflat (start la jumătate); m2m e ~2 % SUB GPS; km_check e o
verificare independentă, nu o componentă.

Rămân de închis — dați poziția FINALĂ, cu cifre:
1. **O singură metodă de normă recomandată** pentru producție, dintre cele aflate în zgomot (Codex «plin pe zi ≥3.000 km», «plin trim10»,
   media Codex + EB Claude, raport pe fereastră). Criterii: eroare pe protocolul comun (explicați de ce cifrele voastre de WAPE diferă între
   rapoartele Claude și Codex din runda 2 — agregare sep+aug vs pe lună, fără/cu camioane — și aliniați-le), robustețe la date puține,
   simplitate de explicat șoferilor/dispecerilor, fără lookahead. Fereastra (de la 10.06 cumulativ / glisantă 3 sau 6 luni), fallback, iarnă.
2. **Pragul de abatere** final (formula) pentru autobuze și ce se face cu camioanele (3 luni cumulate? bilanț rezervor de la zero? nimic automat?).
3. **Lista finală a anomaliilor**: clasă → cazuri → litri/lună → exemple → regula automată → siguranță (mare/medie/mică). Scoateți ce s-a
   dovedit explicat.
4. **Lista finală a acțiunilor** ordonate după litri/lună (și lei la ipoteza 22 lei/l), cu siguranța și cine le face (Ion / dispecer /
   tehnic / cod). Include schimbările de cod concrete (ce funcție SQL, ce în poster).
5. **Ce a rămas dezacord** între voi, dacă ceva, și de ce.
Formatul: markdown român, secțiunile 1–5 în ordinea asta, scurt și dens (max ~250 rânduri).
