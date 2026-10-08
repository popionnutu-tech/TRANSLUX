// Fără importuri de server: lista se folosește și în pagina din browser (ProbaClient).
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Cele 20 de teste ale probei fizice (Ion, 08.10.2026: «dă detaliat Iura ce trebuie să facă, 20 de teste, el are un
// telefon pentru client, are telefon șofer»; «fă ca pagina să trimită mie rezultatele»). O singură listă: pagina de
// probă o arată, iar mesajul către Ion se construiește pe server din ea (clientul trimite doar verdictele și notele).

export type Telefon = 'c' | 's' | 'cs';
export interface TestProba { n: number; grupa: string; who: Telefon; face: string; asteptat: string }

const G1 = 'Pregătire', G2 = 'Comanda A · cumpărare și urcare', G3 = 'Comanda B · returnarea banilor', G4 = 'Greșeli intenționate';
const L: Array<[string, Telefon, string, string]> = [
  [G1, 's', 'Deschide botul (t.me/TransluxMoldova_bot?start=bilete_azi) și apasă butonul spre biletele șoferului.', 'Se deschide; scrie că nu ai curse sau pasageri.'],
  [G1, 'c', 'Deschide pagina de probă (aceasta).', 'Sus e bara roșie «PROBA BILETELOR ONLINE · 10 lei · bani reali».'],
  [G1, 'c', 'Scrie «Briceni» → «Chișinău», lasă «Azi», apasă «Caută cursele».', 'Apar cursele de azi (și cele care au plecat deja) cu ora, prețul real și «la probă 10 lei».'],
  [G1, 'c', 'Scrie o localitate inexistentă, de exemplu «Xyz», și caută.', 'Scrie «Nicio cursă».'],
  [G2, 'c', 'Caută iar Briceni → Chișinău, AZI (biletul de azi se scanează azi). Alege orice cursă, completează numele, prenumele, telefonul CLIENT și e-mailul tău, apasă «Plătește 10 lei».', 'Se deschide pagina maib cu 10,00 MDL.'],
  [G2, 'c', 'Plătește cu cardul.', 'Te întoarce pe translux.md, pe biletul cu bandă roșie «BILET DE PROBĂ», data, codul QR și «Achitat online».'],
  [G2, 'c', 'Pe pagina de probă, la «Probele de azi», apasă «Reîncarcă».', 'Comanda are bifă verde la «creată» și «plătită».'],
  [G2, 'c', 'Verifică e-mailul, inclusiv dosarul Spam.', 'A venit «[PROBĂ] Biletul tău TRANSLUX…», cu bandă roșie în mesaj.'],
  [G2, 'c', 'Pe pagina biletului apasă butonul Telegram.', 'Botul trimite imaginea biletului cu banda roșie; la probe apare bifa «legat în Telegram».'],
  [G2, 's', 'Redeschide biletele șoferului.', 'Apare cursa de azi aleasă și, la ea, pasagerul tău.'],
  [G2, 'cs', 'Cu telefonul ȘOFER scanează QR-ul de pe ecranul telefonului CLIENT.', 'Scrie «ok», cu numele pasagerului și locul.'],
  [G2, 'cs', 'Scanează încă o dată același QR.', 'Scrie că biletul e deja urcat.'],
  [G2, 's', 'Pune telefonul ȘOFER în modul avion, scanează iar QR-ul A, apoi scoate modul avion.', 'După ce revine internetul, scanarea se trimite și răspunsul e tot «deja urcat».'],
  [G2, 'c', 'În bot, cere returnarea biletului A.', 'Botul refuză: «Biletul a fost deja scanat la urcare». Acesta e răspunsul corect.'],
  [G3, 'c', 'Cumpără încă un bilet pentru MÂINE (ca să se poată returna din bot), de data asta fără e-mail, și plătește.', 'La «Probele de azi», e-mailul are liniuță «–», nu ✗.'],
  [G3, 'c', 'Fă o captură de ecran a QR-ului B. Deschide biletul în Telegram, apasă «Returnează», scrie ultimele 4 cifre ale telefonului.', 'Oferta e 10 lei, adică integral.'],
  [G3, 'c', 'Confirmă returnarea.', 'Botul spune că banii se întorc; la probe apare «returnat»; biletul nu mai are QR valabil.'],
  [G3, 's', 'Pasagerul B nu mai trebuie să fie în listă. Scanează QR-ul B de pe captura de ecran.', 'Scrie că biletul e anulat.'],
  [G4, 'c', 'Cumpără un al treilea bilet, dar pe pagina maib apasă înapoi sau închide-o, fără să plătești.', 'Nu apare niciun bilet; comanda are «plătită» ✗.'],
  [G4, 'cs', 'Schimbă o literă în linkul paginii de probă și deschide-l. Apoi, cu telefonul ȘOFER, scanează un QR oarecare (de pe un produs, un afiș).', 'Linkul greșit dă «404»; QR-ul străin dă «necunoscut».'],
];
export const TESTE_PROBA: TestProba[] = L.map(([grupa, who, face, asteptat], i) => ({ n: i + 1, grupa, who, face, asteptat }));

export type Verdict = 'ok' | 'bad';
export interface VerdictTest { v?: Verdict | null; nota?: string | null }

/** Verdictele primite de la pagină, curățate: doar testele 1..20, doar ok/bad, nota ≤ 300 de caractere. */
export function curataVerdicte(brut: unknown): Map<number, { v: Verdict; nota: string }> {
  const out = new Map<number, { v: Verdict; nota: string }>();
  if (!brut || typeof brut !== 'object') return out;
  for (const t of TESTE_PROBA) {
    const x = (brut as Record<string, VerdictTest | undefined>)[String(t.n)];
    if (!x || (x.v !== 'ok' && x.v !== 'bad')) continue;
    out.set(t.n, { v: x.v, nota: String(x.nota ?? '').trim().slice(0, 300) });
  }
  return out;
}

/** Mesajul pentru Ion (Telegram, HTML): sumarul, apoi doar testele cu ✗ (cu nota) și cele nefăcute. */
export function mesajRezultat(verdicte: Map<number, { v: Verdict; nota: string }>, cine: string, cand: string): string {
  const ok = [...verdicte.values()].filter((x) => x.v === 'ok').length;
  const bad = [...verdicte.values()].filter((x) => x.v === 'bad').length;
  const lipsa = TESTE_PROBA.filter((t) => !verdicte.has(t.n)).map((t) => t.n);
  const linii = [
    `🧪 <b>Proba biletelor online</b> — ${escapeHtml(cine)}, ${escapeHtml(cand)}`,
    `✅ ${ok} · ❌ ${bad} · nefăcute ${lipsa.length} din ${TESTE_PROBA.length}`,
  ];
  const picate = TESTE_PROBA.filter((t) => verdicte.get(t.n)?.v === 'bad');
  if (picate.length) {
    linii.push('', '<b>Nu merge:</b>');
    for (const t of picate) {
      const nota = verdicte.get(t.n)?.nota;
      linii.push(`❌ ${t.n}. ${escapeHtml(t.face)}${nota ? `\n   → ${escapeHtml(nota)}` : ''}`);
    }
  }
  if (lipsa.length) linii.push('', `⬜ Nefăcute: ${lipsa.join(', ')}`);
  if (!picate.length && !lipsa.length) linii.push('', 'Toate cele 20 de teste au mers.');
  return linii.join('\n');
}
