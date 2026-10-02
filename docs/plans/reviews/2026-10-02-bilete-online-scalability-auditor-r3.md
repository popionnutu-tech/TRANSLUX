## Review: scalability-auditor — runda 3

Verificat pe v3 (rândurile din plan) și în cod.

| Id | Stare | Dovadă |
|---|---|---|
| SC-8 | deschis parțial | Plafon 50 (:187) și închiderea întâi a `noua` fără checkout (:237) există. Dar comenzile unui abuzator trec de `createCheckout` și AU `checkout_id`; «închide întâi fără checkout» nu le eliberează, ele așteaptă expirarea maib. Fără alertă la atingerea plafonului (nu există tip în `bilete_alerte`, :152). Vezi SC-17. |
| SC-9 | închis | `ip_hash` calculat pe web, trimis în corp (:185). |
| SC-10 | închis cu rezervă | `ORDER BY created_at LIMIT 25` și `creare_incercari` ≥ 3 (:237-238). Rezerva: SC-15. |
| SC-11 | închis cu rezervă | Tabela și indexurile există (:142, :148). Rezerva: retenția, SC-14. |
| SC-12 | închis | Antete `s-maxage=300, swr` pe HTML fără date personale (:292); JS cu hash. |
| SC-13 | închis | `valid` + `urcat`, fără condiție de timp (:44, :196). Notă: corecția BL-13 «refund după confirmarea zilei → alertă» nu apare în 4b (în sarcina BL). |

### Observații noi

**SC-14 · high · `bilete_api_apeluri` se păstrează 90 de zile.** Plan :148 «curățată de 5c», iar 5c (:247) o șterge doar la 90 de zile. Plafonul de 120/min are nevoie de ultimul minut. Reîmprospătarea la 60 s (:301) înseamnă ~66 șoferi × ~600 cereri/zi ≈ 40.000 rânduri/zi, deci ~3,5 milioane în 90 de zile, plus index. Baza e pe NANO (0,5 GB), care a căzut deja la 01.10 pe volum de import. Fiecare cerere face și un INSERT, deci și deadtuple-uri. *Corecție:* renunță la plafonul pe șofer (`initData` e semnat; propunerea mea alternativă din SC-11) sau șterge rândurile > 5 min în chiar RPC-ul de numărare; în ambele cazuri scoate tabela din 5c.

**SC-15 · medium · «scoatere din lot» nedefinită.** La `creare_incercari` ≥ 3 (:238) nu se spune în ce stare trece comanda. Dacă rămâne `eroare_creare`, rămâne în indexul parțial (:142) și, cu `ORDER BY created_at`, ocupă capul lotului: exact blocajul din SC-10. *Corecție:* stare terminală (`expirata` + alertă `creare_esuata`) sau filtru `creare_incercari < 3` în interogare.

**SC-16 · low · un singur buget de 20 s / 25 de rânduri pentru patru treburi** (creare, plăți, refund-uri, notificări șofer, :237-244). Fără cotă pe categorie, un lot de `noua` înfometează notificarea șoferului. *Corecție:* cotă pe categorie (ex. 10/10/5) sau notificările primele.

**SC-17 · low · plafonul global nu e atomic.** Verificarea 50 apoi INSERT permite depășirea sub concurență. *Corecție:* RPC cu `pg_advisory_xact_lock` sau toleranță declarată; alertă `plafon_atins`.

### Deduceri
SC-14 −2.0; SC-8 rezidual −1.0; SC-15 −1.0; SC-16 −0.5; SC-17 −0.5.

Scor: 5.0 · Blocante (critical/high): 1
