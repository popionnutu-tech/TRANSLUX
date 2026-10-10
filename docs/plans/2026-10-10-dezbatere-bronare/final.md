# Dezbatere bronare + plată — rezultatul final (3 runde Claude ⇄ Codex, 10.10.2026)

Cerut de Ion (10.10.2026): «lansează 3 runde negociere Claude–Codex pe tot sistemul nostru de bronare și achitare, să vezi
dacă sunt bug-uri în logică; să se verifice și cu alte site-uri de rezervări autobuze».

Fișiere: `runda-1-claude.md`, `runda-2-claude.md` (acest dosar); verdictele Codex (runda 1 și 3) sunt rezumate mai jos;
cercetarea externă: `reports/Bronare și plată autobuz bune practici.md` (copie în acest dosar: `cercetare-externa.md`).
Verificat pe `origin/main` = a74a0963. Toate rundele au fost doar citire; singura schimbare făcută în timpul dezbaterii:
migr. 556 (oprirea legării automate la Telegram după telefon, C1).

## Acord deplin

| # | Defect | Gravitate (Claude / Codex) | Ce se repară |
|---|---|---|---|
| N7 + C7 | «Găsește biletul» (telefon + nume) dă codul biletului; anularea pe site/bot cere doar codul + ultimele 4 cifre ale aceluiași telefon → oricine știe telefonul și numele poate anula călătoria altuia | high / **critical** | decizia D1, apoi aceeași regulă pe site, bot și asistent |
| N2 + C3 | Anularea și refund-ul nu sunt o «intenție» durabilă: proces oprit între anulare și bancă → bani nereturnați, nimic nu reia; returul din pachet nu se finalizează automat | high / high | protocol de refund pe intenție (id, checkout, membri, sume, stare, revendicare cu termen), worker de reluare, reconciliere înainte de orice retrimitere |
| C2 | Sesiunile maib rămân deschise ≥ 23 h; împăcarea ia mereu aceleași 10; plata poate veni după expirarea rezervării sau după plecare | high / high | recuperare → cancel eligibil → reverificare → expirare condiționată; rotație după încercare; plata după plecare → bani înapoi automat (D2), după ora executării la bancă (executedAt), nu a callback-ului |
| N1 | Scanare și anulare simultane: omul urcă și primește și banii | medium / **high** | anularea blochează biletele (ordine stabilă, inclusiv returul) înainte de verificări; test cu două conexiuni |
| N3 | Reluarea cu aceeași cheie dar alt loc/nume/opriri primește sesiunea comenzii vechi (și pe calea concurentă din SQL) | medium / **high** | o singură amprentă a alegerii, verificată în toate ramurile, inclusiv pe rezultatul RPC |
| N6 | Noaptea schimbării orei (25.10): 00:05–02:59 ies cu o oră mai târziu; 03:00 ambiguă; primăvara golul e 03:00–03:59 | medium / **high** | conversie zonală pe ora exactă + recalcularea comenzilor viitoare deja scrise; **înainte de 25.10** |
| C4 / C5 | Rezervarea de 30 min curge de la comandă, nu de la sesiune; comenzile neplătite pot umple cota/plafonul gratuit | medium | termen unic al rezervării, revalidat atomic la crearea sesiunii; limite alternative la plafonul global |
| N4 | Tur-retur din mini app: returul nu primește contul Telegram, nu ajunge în chat | medium | propagarea identității turului pe returul din pachet (fără telefon) + recuperarea celor existente |
| C6 | Garanția de lansare nu merge din bot (latent, garanția e oprită) | medium | aceeași eligibilitate în bot, site și asistent |
| N5 | SMS: primul eșec blochează reluarea (latent, SMS oprit) | low acum, medium la pornire | revendicare cu termen + stări separate refuz/necunoscut |
| C8 | Panoul nu exclude șoferii de test la «șofer legat» | low | filtrul is_test în panou |
| C11 | 03:00 pe 25.10 alege a doua apariție | low | parte din N6 + decizia D5 |

## Decizii de produs (nu bug-uri)
- C10 — un QR pe comandă trece toate locurile la «urcat»; C13 — returul din pachet nu se mai returnează după scanarea
  turului: decizii existente, de scris clar în condiții înainte de plată.
- C12 — suma pachetului numără și returul expirat: invariant de păzit, fără cale reproductibilă azi.
- C9 — numele opririlor scrise de client: nedemonstrat; întărire opțională.

## Decizii cerute lui Ion
- **D1** Cum se autorizează anularea cât SMS-ul nu merge (N7).
- **D2** Plata care ajunge după plecarea cursei: bani înapoi integral automat (recomandarea ambelor părți).
- **D3** Vineri spre Bălți, plecare înainte de 11:00: 4 locuri online (ca acum) sau fără limită?
- **D5** Ora 03:00 care apare de două ori pe 25.10: prima sau a doua apariție (recomandare: după grafic, ora de vară = prima).
- **D6** De întrebat MAIB: acceptă un al doilea refund parțial pe aceeași plată (Checkout v2)?

## Ordinea reparațiilor
1. N7 (după D1) — azi. 2. N6 — înainte de 25.10. 3. N2/C3 refund durabil (migrație). 4. C2 + C4/C5 sesiuni și rezervare
(migrație, executedAt). 5. N1 scanare/anulare (migrație). 6. N3 amprenta alegerii. 7. N4, C6, C8, N5.
