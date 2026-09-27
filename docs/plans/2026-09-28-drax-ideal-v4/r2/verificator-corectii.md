# Corecții PROPUSE — runda 2 (v8 = ideal-v4.1); nimic scris
1. **Registrul (sesiunea):** re-semnarea celor 5 explicații pe bfa070f0…, ștergerea celor 24 de intrări moarte (inclusiv G1 Bocancea Schit), apoi v9 pe aceeași sursă, înainte de `ideal-activ` → `ideal-v4.1`. Efect km: 0.
2. **Cheia cache-ului** (`drax/cod/ideal-v4.1/schelet.mjs`, `ruta|linie|zi|schimb|m`): se adaugă capătul, ca următoarea mutare să invalideze singură cache-ul (în v4.1 s-au curățat de mână 25 de intrări). Efect km: 0.
3. **H4:** listă de diagnostic săptămânală (nu excludere), cu coloanele linie, mașină, picioare, %, satele străine, ture/zi GPS vs act; C44 pe Dominteni și Prajila înainte de orice regulă. Efect: 0 până la decizie.
4. **§4.1:** pragul «regulat» scris (propus: ≥ 30 % pe fiecare sens, pe toată fereastra, fără parcare, ≥ 2 mașini). Efect km: 0 (R28 și R37 trec).
5. **Verificatorul (propunere; sesiunea aprobă):** `ruleaza.sh` copiază `capete-gps.json`; `drax.mjs` raportează `capatAct` / `exclusEtalon` și le scoate din C47 la fel ca lanțul.
