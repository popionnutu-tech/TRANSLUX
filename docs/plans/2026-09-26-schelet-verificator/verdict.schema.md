# `verdict.json`, `judecata.json` și poarta spre F3 — contractul schelet-verificator (ION-95 v4)

## Cine scrie ce

| Pas | Cine | Ce |
|---|---|---|
| `ruleaza.sh v<N>` (root) | rezolvă sursa; pentru un **candidat** (altă sursă decât `drax/date`) cere marcajul `GATA` al producătorului (rânduri `<sha256>  <fișier>.json`) și TOATE intrările în sursă (doar nomenclatorul poate veni din `drax/date`), altfel cod 2; scrie `sursa.txt` + `manifest-inainte.txt`; copiază intrările cu `cp` (nlink 1, sha256 copie = sursă) în `<RUN>/in/` (root 644) + `surse.json`, `ferestre-drax.json`, `porti-drax.json`, `explicatii-drax.json` | — |
| `drax.mjs` + `etalon-gps.mjs` (utilizatorul `verif`) | citește `<RUN>/in/`, scrie `<RUN>/out/controale.json` și `verdict.json.tmp` | `verif` nu poate intra în `/root`; `/home/verif` și `verificator/{cod,date,rulari}` sunt `root:root 755` |
| `ruleaza.sh` (root) | `manifest-dupa.txt`; identic → `SIGILIU` (sha256: verdict, manifest, `drax.mjs`, `etalon-gps.mjs`, `ruleaza.sh`) + `mv` → `verdict.json`, ieșirea trece la root 644; diferit → `verdict.RESPINS.json`, cod 5 | — |
| `ruleaza.sh proba-r1 / proba-registru <RUN>` | sursa din `sursa.txt` a rulării (nu din mediu) | — |
| `ruleaza.sh inchide <RUN>` | `manifest-final` = `manifest-inainte` → `INCHIS ok`, altfel «atins» + cod 5 | ultimul pas al oricărei verificări |
| agentul | `judecata.json`, `raport.md`, `corectii.md`, `intrebari.md` în calea de ieșire din prompt | notată de sesiune cu `noteaza.mjs` |

Manifestul: sha256 + stat pe intrări și pe cele 5 fișiere F3; stat pe `*-ideal.json` / `nomenclator.json` / `GATA` din `drax/date` și din
sursă, și pe `drax/cod/ideal/`. NU pe tot arborele `drax/`: alte sesiuni scriu legitim acolo.

## `verdict.json`

```jsonc
{
  "versiune": "drax.mjs v4 · <sha[0:12]>",
  "script": { "drax_sha256": "…", "etalon_sha256": "…", "etalon": "etalon-gps v4", "ruleaza_sha256": "…", "node": "v20.20.2", "tz": "2025c", "icu": "78.2", "fus": "Europe/Chisinau" },
  "uzina": "DRAXELMAIER_BALTI", "rulat_la": "…Z", "verif_d": "/home/verif/verificator/rulari/drax-v4-<epoch>", "verif_src": "<realpath sursă>",
  "proba": null,
  "intrari": { "<fișier>": { "sursa": "<cale reală>", "sha256": "…", "bytes": 0 } },
      // 9 intrări: schelet, obs, etalon, curse, regulate, schimburi, care-schimb, dubluri-ideal, nomenclator; + ferestre-drax, porti-drax, explicatii-drax
  "unitati": { … }, "praguri": { … },
  "blocante": [ { "id": "G1", "control": "G1", "nivel": "blocant", "ruta": "…", "linie": "…", "cifra": "…", "motiv": "…" } ],
  "explicate": [ … ], "numarate": { … }, "valid_pentru_export": false
}
```
`controale.json`: toate constatările + tabelul **`linii`**: `etalonGPS` (completat), `etalonGPS_brut`, `porti` (tur/retur), `km_card`,
`dif_pct`, `zileBuneGPS`, `c47`, `corectie` (`directă` / `diagnostic cerut` / null), `picioareAltaPoarta`, `tureZiGPS`, `kmZiGPS`, `ore`,
`ziAleasaBunaGPS`, `replica_regulate`.

**Etalonul GPS** (un singur modul, `etalon-gps.mjs`, pe care F3 îl folosește la pasul E pentru a scrie cardul în `schelet-ideal` v2):
- se iau doar picioarele de pe poarta sensului;
- km = `plin` + raza porții (`porti-drax.json`: EST 0,6, VEST 0,5, din `drax/cod/ideal/curse.mjs:18`);
- valoarea e mediana pe zilele bune GPS, cu minimum 3 zile;
- pe liniile cu C47 <60 %, cardul NU se scrie automat: întâi diagnostic.

## Ce e blocant

| id | Când |
|---|---|
| R1 | linie din act lipsă / necunoscută / dublă |
| C31 | linie din act fără ideal, fără explicație în registru |
| V1 | `km`/`kmZi` nevalid pe o linie care nu e `faraIdeal` |
| C36 | aceeași deplasare pe două linii |
| C37 | dublu între mașini pe aceeași linie ≥50 % (numitor pe linie) |
| C38 | ziua aleasă cu tur sau retur >140 km |
| C43 | capăt negăsit / fără atingeri |
| G1 | km card ≠ etalonul GPS completat >5 %, sau etalon nedeterminat; motivul spune «corecție directă» sau «diagnostic cerut» (C47 <60 %) |
| C4 | dublură «sigur» cu efect (etalon GPS >5 %, ziua aleasă, ture/zi, ore ≥15 min, sate) în oricare variantă pe dispozitiv, sau NEDETERMINAT |
| D6 | s1 ≠ s2 >18 % confirmat (≥3 zile pe fiecare schimb + mediane pe observații) |
| D1 W53 | date ≥ 21.12.2026 cu `care-schimb` încă pe paritate |
| C5 | fereastra de date în afara EEST cât timp lanțul are UTC+3 |

## Registrul (`/home/verif/verificator/date/explicatii-drax.json`, root 644)

Îl scrie DOAR sesiunea, după dezbatere. Formatul unei explicații:

```
{ id (canonic: C31, G1…), ruta, linie, motiv, hotarat_prin, data, sha_intrare (sha256 schelet-ideal) }
```

Regulile:
- explicația ține doar pe același sha; altfel apare `X1 registru mort`;
- textele sunt fapte măsurate, cu formula scrisă (km/zi GPS = picioare × plin median ÷ 74 de zile L–V ale ferestrei);
- după orice completare urmează o rulare nouă și `proba-registru`;
- v4 (26.09): R13 ≈ 9 km/zi, R18 ≈ 5 km/zi, Iabloana ≈ 2 km/zi — «neacoperite explicit», re-semnate pe `43dcceaf…`.

## Poarta spre F3 (F3 doar o CHEAMĂ, ca root, cu sursa EXPLICITĂ)

```
bash /home/verif/verificator/cod/poarta.sh export /root/lde-worker/drax/date/ideal-v2   # E.2, ÎNAINTEA exportului și a `ln -sfn … ideal-activ`
bash /home/verif/verificator/cod/poarta.sh write "$REF_SRC"                             # înaintea primei saptamanal.sh --write, cu variabila folosită la copiere
```
Poarta deschide (cod 0) doar pe cel mai nou verdict care îndeplinește TOATE condițiile:
- e sigilat, iar sha-ul lui se potrivește cu `SIGILIU`;
- e închis (`INCHIS ok`);
- nu e verdict de probă;
- are `verif_src` = sursa dată;
- are sha-urile `drax.mjs` + `etalon-gps.mjs` = cele instalate acum (L8);
- `valid_pentru_export` e `true`;
- **toate cele 9 intrări** au sha256 egal cu fișierele de acum;
- pentru un candidat, există și marcajul `GATA`.

Pe stdout, poarta scrie lista «sha256  cale», pe care `saptamanal.sh` o recompară pe copia din `_ref` după copiere (L4).

Codurile:
- 0 deschis;
- 2 folosire greșită (sursă lipsă sau inexistentă; `POARTA_VERDICT` în afara `rulari/`);
- 3 închis: blocante, sigiliu invalid, verdict ilizibil sau corupt, sha diferit, alt script, candidat fără `GATA`.

Probele făcute pe 26.09 (v4):

| Probă | Cod |
|---|---|
| fără sursă | 2 |
| `export drax/date` | 3 (5 blocante G1) |
| `write drax/date` | 3 |
| `POARTA_VERDICT` în `/tmp` | 2 |
| verdict alterat sub `rulari/` | 3 (sigiliu invalid) |
| verdict corupt | 3 (ilizibil) |

## `judecata.json` (ieșirea agentului; forma în corpul agentului, §7)

Conținut:
- `linii[]` (toate liniile din act + `*`): `{ ruta, linie, verdict, mecanisme[], controale[], cifre, propunere, diagnostic }`;
- `masini[]`: `{ masina, mecanisme[], treapta, zile, cifre, propunere }`;
- `flota[]`;
- `intrebari[]`.

Mecanismele vin dintr-un vocabular închis. Notarea (`noteaza.mjs`, sesiunea) compară mecanismul, verdictul și treapta cu fișierul-etalon
din afara repo-ului. Proba e anulată dacă transcriptul atinge `memory/drax-`, `docs/plans/2026-09-2`, `scratchpad/sv/` sau `verif-etalon`.

## v4.1 (27.09.2026)

- **Structura rulării.** `in/` (root) · `work/` (verif; `drax.mjs` scrie aici) · `out/` (root; `verdict.json`, `controale.json`, `SIGILIU`, `drax.log`) · `diag-out/` (verif). Root copiază din `work/` cu `cp -P` și refuză legăturile. Root nu face cp/chmod/mv în dosarele lui `verif`.
- **Diagnostic.** `diag.sh <RUN> <sursa>`:
  - sursa trebuie să fie un fișier al lui root, într-un dosar al lui root fără scriere pentru alții;
  - se instalează în `diag-cod/` (root 755);
  - rulează ca `verif`, cu cwd `diag-out/`.
- **SIGILIU și poarta** cer sha-urile curente pentru `drax.mjs`, `etalon-gps.mjs`, `filtru-rupte.mjs`, `c4.mjs`, `poarta.sh` și `poarta.mjs`. Manifestul acoperă `cod/` și `date/`.
- **Blocante noi:**
  - `C4` NEDETERMINAT, când lipsește identitatea dispozitivului (`dev`);
  - `E1 steag lipsă`: o linie cu C47 <60 % sau cu variante divergente (G1 orice poartă >5 %) fără câmpul `diagnostic` în `schelet-ideal.json` al sursei și fără explicație `E1`.
- **Abateri noi:**
  - `C22 zi aleasă`;
  - `X2 re-semnare`: registrul e pe alt sha decât sursa verificată.
- **`controale.json` → `linii`:** câmpuri noi `etalonOricePoarta`, `zileBuneOricePoarta`, `picioareRupte`, `steag`, `variante`.
- **`porti-drax.json`** are acum și coordonatele porților, pentru filtrul de urmă ruptă.
