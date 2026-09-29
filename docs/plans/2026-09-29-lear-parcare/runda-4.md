# ION-143 — runda 4 (după revizia Claude r3: 8/10) — pentru criticul Codex

Documentele de bază: runda-1.md (cererea lui Ion: «aplica pe pagina harta si lear cu punctele optimale»; regulile permanente: km reali GPS,
doar km, naveta nu se numără, parcul Bălți = reparație; regulile LEAR R1/R2/R3 rămân), runda-2.md și runda-3.md (triajurile auditorului Claude,
r1 5/10 → r2 7/10 → r3 8/10). Regulile LEAR din bază: lde_uzine.reguli_livrare, id LEAR_UNGHENI și LEAR_FLORESTI (Supabase zqkzqpfdymddsywxjxow).
Cod: vps/lear-parcare.mjs (v4, calculul), vps/lear-parcare-valid.mjs (probele înaintea scrierii), vps/scrie-lear-parcare.mjs (date.parcare în
lde_analiza_reguli), vps/lear-harta.mjs (lde_harta_zi), vps/lant.sh, vps/patch-dump.mjs + patch-dump2.mjs (opțiunea --dump din lear-analiza.mjs).
Panoul: apps/admin/src/app/(dashboard)/lde/harta/* (alegerea uzinei), lib/lde/drax-harta.ts (UZINE_HARTA, randuriDinIntervale),
app/(dashboard)/lde/reguli/ParcareDrax.tsx (uz=lear) și ReguliClient.tsx (blocul în raportul LEAR). Rulări: vps/rulare-21.09-r2/r3/r4.txt.

## Metoda v4, pe scurt
1. Urma săptămânii tăiată în curse la poartă (lipit cât mașina nu iese din rază), la staționări > 25 min și la tăceri > 30 min.
2. Cursele cu oameni după opririle în sate (§4.8), fără celulele de infrastructură (≥ 5 mașini, ≥ 4 ore; oprirea completă ≥ 20 s tot contează):
   tur (spre poartă; de la PRIMA apropiere ≤ 1 km de capătul rutei — lista §1.4 + capetele fixate §4.5 / ION-63 — altfel ≥ 2 opriri),
   retur (de la poartă până la ULTIMA apropiere de capăt, altfel ≥ 2 opriri), «în plus» poartă → poartă cu opriri (schimbul 3),
   «fără poartă» cu ≥ 2 opriri (rută întreruptă), nu la Bălți.
3. Drumurile de parcare = golurile ≥ 60 min dintre curse; scoase: > 12 h, cele care nu ies la > 2 km de poartă, cu oprire la ≤ 4 km de Bălți
   (service), la poarta altei uzine. Opririle din gol se taie ca muncă de o parte și de alta a staționării; controlul §10 (nicio oprire rămasă)
   scoate mașina, nu uzina.
4. Real = km GPS ai golului − km «timp liber» / brambura (§11.9). Propus prin P = (V(E,P) + V(P,S)) × 1,05, Valhalla bus; loc fără drum
   Valhalla nu e candidat. Pe fiecare drum: prin locul ales sau «rămâne cum e» (loc 0) — când acum face mai puțin, când locul e la ≤ 4 km de unde
   mașina deja stă (nu e mutare) sau câștigul e sub max(2 km, 5 %).
5. Candidați: poarta (R1), casa, satele / orașele ≤ 15 km de E / S. 1–2 locuri ca Drăxlmaier ION-136 (al doilea ≥ 20 km/săpt. și ≥ 3 drumuri,
   toleranță 20 km pentru «deja» ≥ 2 zile > oraș > sat). Fără propunere: un singur schimb măsurat (§8.3), rute neverificate (> 50 % din
   tururi / retururi fără capăt), controlul §10, niciun drum, «nu scade km».

## Triaj r3 (auditor Claude)
1. MEDIUM «centrul localității» (504BRAR, 032BRAT) — ACCEPTAT: locul la ≤ 4 km de unde mașina deja stă în golul acela = «rămâne cum e».
   504BRAR 61,7 → 22,9 (Valea Mare, 7 drumuri); 032BRAT 73 → 58,3.
2. LOW Bălți la capătul cursei — ACCEPTAT (și punctul unde se oprește cursa).
3. LOW celulele de infrastructură — ACCEPTAT (fără vecini; oprirea completă ≥ 20 s tot contează).
4. LOW câștigurile mici — ACCEPTAT (sub max(2 km, 5 %) = rămâne cum e).
Migrația regulilor (440, după verdict): LEAR_FLORESTI §4.2 → capătul A2 Cunicea (ION-63); ambele uzine: secțiunea 13 «Parcarea propusă».

## Rezultat 21–27.09 (vps/rulare-21.09-r4.txt)
LEAR Ungheni −3.424,9 km/săpt. (13 mașini cu loc; 320BRAT fără, §8.3): 827MUM 663 Petrești · 809MUM 580 poarta · 189OMM 347 poarta ·
145BRAZ 292 Elizavetovca · 807MUM 276 · 217RST 268 · 061COY 244 · 537BRAT 238 · 456BRAX 181 · 183BZP 159 · 732SHS 96 · 032BRAT 58 · 504BRAR 23.
LEAR Florești −812 km/săpt.: 894BRAX 259 · 849BRAN 217 · 035BRAT 172 · 279BRAT 113 · 603BRAS 52; 713IZX fără (§8.3).
Validarea trece; harta 71 + 30 zile, 0 abateri de km; a doua rulare aceeași cifră.

## Afișarea și lanțul
Pagini, fără poster (Ion a cerut «pagina hartă și LEAR»). Luni 08:00, lear-saptamanal.sh: lear-analiza --write --dump → lant.sh
(lear-parcare → scrie-lear-parcare → lear-harta), LEAR_PARCARE=0 îl sare; picat = nu scrie, restul uzinelor și albumul merg.

## Întrebări pentru Codex
1. Metoda poate intra pe pagini? Ce e greșit sau riscant (umflarea economiei, tăierea muncii, alegerea locului)?
2. «Rămâne cum e» pe drum (loc 0) — corect față de metoda Drăxlmaier (unde nu există)?
3. Lanțul de luni și scrierea în bază (citire + rescriere a rândului, validare, DELETE + INSERT în lde_harta_zi) — riscuri?
