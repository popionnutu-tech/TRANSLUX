import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface FuelBreakdown {
  litriTotal: number | null;     // total liters (from receipt)
  litriNumerar: number | null;   // proportional: litriTotal × (numerar/total)
  litriCard: number | null;      // proportional: litriTotal × (card/total)
  litriCvc: number | null;       // proportional: litriTotal × (cvc/total)
  total: number | null;
  numerar: number | null;
  card: number | null;
  cvc: number | null;
}

export interface ZReportData {
  nrRaportZ: number | null;
  nrBonuriFiscale: number | null;
  dataOra: string | null; // ISO format: YYYY-MM-DDTHH:MM
  totalNumerar: number | null;
  totalCard: number | null;
  totalCvc: number | null;
  motorina: FuelBreakdown;
  benzina95: FuelBreakdown;
  gaz: FuelBreakdown;
  totalVanzari: number | null;
  validationWarnings: string[];
}

const SYSTEM_PROMPT = `Ești un sistem OCR specializat pentru citirea rapoartelor Z zilnice (RAPORT ZILNIC) de la stațiile de carburant din Moldova/România.

REGULI CRITICE — respectă-le exact:

1. NR. RAPORT Z:
   - Caută linia care conține textul "RAPORT ZILNIC" și citește numărul care apare imediat DUPĂ "#" sau între paranteze pe ACEEAȘI linie.
   - Exemplu corect: "RAPORT ZILNIC #(301)" → nrRaportZ = 301
   - GREȘIT: NU folosi câmpul "NR. JE" sau "NR. Z" din secțiunea RAPORT GENERAL — acelea sunt numere diferite.

2. DATA/ORA:
   - Citește data și ora din secțiunea BON FISCAL de la SFÂRȘITUL documentului (ultimele linii ale chitanței).
   - Formatul pe chitanță este DD-MM-YYYY HH:MM — convertește în ISO: YYYY-MM-DDTHH:MM.
   - Exemplu: "28-02-2026 00:11" → dataOra = "2026-02-28T00:11"
   - GREȘIT: NU folosi câmpul "DATA:" sau "NR. JE ... DATA:" din secțiunea "RAPORT GENERAL" — acela este momentul închiderii schimbului, NU data bonului fiscal.

3. CIFRE — atenție maximă la confuzii optice frecvente pe hârtie termică:
   ⚠ CRITICĂ: "9" arată ca "0" sau "8" — aceasta este cea mai frecventă eroare!
     Exemple reale de erori OCR confirmate:
       7962.140 L citit greșit ca 7062.14 L  (9→0)
       1294.570 L citit greșit ca 1204.57 L  (9→0)
       269.750 L  citit greșit ca 269.700 L  (5→0) sau 269.7 (zero tăiat)
       21 898.18  citit greșit ca 21 888.18  (9→8)
   - "7" poate arăta ca "1"
   - "6" poate arăta ca "0" sau "5"
   - "8" poate arăta ca "3" sau "0"
   - Pentru litri (ex: 7962.140), verifică fiecare cifră — nu tăia zerourile finale (269.750 ≠ 269.7)

4. LITRI — regulă critică, greșeli confirmate în producție:
   Structura exactă pe chitanță pentru fiecare combustibil:
     [Tip combustibil]
     Cant: (Litr)  XXXX.XXX   ← O SINGURĂ linie = cantitatea TOTALĂ vândută
     NUMERAR       XXXX.XX    ← Lei încasați cash (NU litri separați!)
     CARD          XXXX.XX    ← Lei încasați card (NU litri separați!)
     CVC           XXXX.XX    ← Lei încasați corporativ (dacă există)
     Total X       XXXX.XX    ← Total Lei

   ✅ CORECT: "litri" = valoarea de pe linia "Cant: (Litr)" = cantitate totală
   ❌ GREȘIT confirmat: OCR a asignat toți litrii la Numerar → Diesel: 7062.14L=88303 Lei, Card: 0L=46677 Lei
      Aceasta este o eroare gravă — fizic imposibil să vinzi 0 litri și să încasezi bani!

   Reguli stricte:
   - "litri" din JSON = valoarea exactă de pe linia "Cant: (Litr)" (nu pentru Numerar, nu pentru Card)
   - "numerar", "card", "cvc" din JSON = DOAR sumele în Lei, fără litri
   - NU pune cantitatea de litri în câmpurile numerar/card/cvc — acestea primesc NUMAI valori Lei
   - Litrii proporționali pe metodă de plată se calculează ulterior în cod, nu de tine

5. VALIDARE MATEMATICĂ (obligatorie):
   - Motorina total = Motorina Numerar + Motorina Card + Motorina CVC
   - Benzina total = Benzina Numerar + Benzina Card
   - Gaz total = Gaz Numerar + Gaz Card
   - Total Vânzări = Motorina total + Benzina total + Gaz total
   - Total Numerar = Motorina Numerar + Benzina Numerar + Gaz Numerar
   - Dacă o sumă calculată NU egalează totalul citit → re-citește și corectează cifrele greșite.
   - Verificare litri: litri × (sumă_tip/total_vanzari) trebuie să dea valori rezonabile (prețul/L = 15–35 Lei).

6. EXEMPLU CONCRET — chitanță reală cu erori OCR cunoscute:
   Chitanță arată:
     Gaz lichefiat
     Cant: (Litr)  269.750
     NUMERAR       2 751.49
     CARD            500.00
     Total B       3 251.49

   ❌ OUTPUT GREȘIT (erori reale produse anterior):
     "gaz": { "litri": 269.7, "numerar": 269.7, "card": 0, "total": 3251.49 }
     Probleme: 269.750→269.7 (zero tăiat), litrii puși la numerar, card=0

   ✅ OUTPUT CORECT:
     "gaz": { "litri": 269.750, "numerar": 2751.49, "card": 500.00, "total": 3251.49 }

7. FORMATUL RĂSPUNSULUI — returnează EXCLUSIV JSON valid, fără text adițional:
{
  "nrRaportZ": <număr întreg>,
  "nrBonuriFiscale": <număr întreg>,
  "dataOra": "<YYYY-MM-DDTHH:MM>",
  "totalNumerar": <număr cu 2 zecimale>,
  "totalCard": <număr cu 2 zecimale>,
  "totalCvc": <număr cu 2 zecimale>,
  "motorina": {
    "litri": <număr cu 3 zecimale — TOTAL, nu per metodă plată>,
    "total": <număr cu 2 zecimale>,
    "numerar": <număr cu 2 zecimale — SUMA LEI, nu litri>,
    "card": <număr cu 2 zecimale — SUMA LEI, nu litri>,
    "cvc": <număr cu 2 zecimale — SUMA LEI, nu litri>
  },
  "benzina95": {
    "litri": <număr cu 3 zecimale — TOTAL, nu per metodă plată>,
    "total": <număr cu 2 zecimale>,
    "numerar": <număr cu 2 zecimale — SUMA LEI, nu litri>,
    "card": <număr cu 2 zecimale — SUMA LEI, nu litri>
  },
  "gaz": {
    "litri": <număr cu 3 zecimale — TOTAL, nu per metodă plată>,
    "total": <număr cu 2 zecimale>,
    "numerar": <număr cu 2 zecimale — SUMA LEI, nu litri>,
    "card": <număr cu 2 zecimale — SUMA LEI, nu litri>
  },
  "totalVanzari": <număr cu 2 zecimale>,
  "validationWarnings": [<string dacă există neconcordanțe matematice>]
}
Câmpurile lipsă din chitanță → null. Nu inventa valori.`;

export async function parseZReport(imageBase64: string, mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'): Promise<ZReportData> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'Citește acest raport Z și returnează datele în format JSON conform instrucțiunilor. Aplică validarea matematică și notează orice neconcordanțe în validationWarnings.',
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Strip markdown code blocks if present
  const jsonText = text.replace(/```(?:json)?\n?/g, '').trim();

  let parsed: Partial<ZReportData>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`OCR răspuns invalid JSON: ${text.slice(0, 200)}`);
  }

  // Run local math validation as second layer
  const warnings: string[] = [...(parsed.validationWarnings ?? [])];

  const mot = parsed.motorina;
  if (mot?.numerar != null && mot?.card != null && mot?.cvc != null && mot?.total != null) {
    const calcTotal = round2(mot.numerar + mot.card + mot.cvc);
    if (Math.abs(calcTotal - mot.total) > 0.02) {
      warnings.push(`Motorina: ${mot.numerar}+${mot.card}+${mot.cvc}=${calcTotal} ≠ total ${mot.total}`);
      // Auto-correct total from parts
      mot.total = calcTotal;
    }
  }

  const benz = parsed.benzina95;
  if (benz?.numerar != null && benz?.card != null && benz?.total != null) {
    const calcTotal = round2(benz.numerar + benz.card);
    if (Math.abs(calcTotal - benz.total) > 0.02) {
      warnings.push(`Benzina95: ${benz.numerar}+${benz.card}=${calcTotal} ≠ total ${benz.total}`);
      benz.total = calcTotal;
    }
  }

  const gaz = parsed.gaz;
  if (gaz?.numerar != null && gaz?.card != null && gaz?.total != null) {
    const calcTotal = round2(gaz.numerar + gaz.card);
    if (Math.abs(calcTotal - gaz.total) > 0.02) {
      warnings.push(`Gaz: ${gaz.numerar}+${gaz.card}=${calcTotal} ≠ total ${gaz.total}`);
      gaz.total = calcTotal;
    }
  }

  if (mot?.total != null && benz?.total != null && gaz?.total != null && parsed.totalVanzari != null) {
    const calcGrand = round2(mot.total + benz.total + gaz.total);
    if (Math.abs(calcGrand - parsed.totalVanzari) > 0.02) {
      warnings.push(`Total: ${mot.total}+${benz.total}+${gaz.total}=${calcGrand} ≠ totalVanzari ${parsed.totalVanzari}`);
    }
  }

  // Validate liters: price per liter must be in realistic range 15–35 Lei/L
  const PRICE_MIN = 15, PRICE_MAX = 35;
  if (mot?.litri && mot?.total) {
    const ppl = mot.total / mot.litri;
    if (ppl < PRICE_MIN || ppl > PRICE_MAX) {
      warnings.push(`Motorina litri suspect: ${mot.total} Lei / ${mot.litri} L = ${ppl.toFixed(2)} Lei/L (așteptat 15–35)`);
    }
  }
  if (benz?.litri && benz?.total) {
    const ppl = benz.total / benz.litri;
    if (ppl < PRICE_MIN || ppl > PRICE_MAX) {
      warnings.push(`Benzina95 litri suspect: ${benz.total} Lei / ${benz.litri} L = ${ppl.toFixed(2)} Lei/L (așteptat 15–35)`);
    }
  }
  if (gaz?.litri && gaz?.total) {
    const ppl = gaz.total / gaz.litri;
    if (ppl < PRICE_MIN || ppl > PRICE_MAX) {
      warnings.push(`Gaz litri suspect: ${gaz.total} Lei / ${gaz.litri} L = ${ppl.toFixed(2)} Lei/L (așteptat 15–35)`);
    }
  }

  return {
    nrRaportZ: parsed.nrRaportZ ?? null,
    nrBonuriFiscale: parsed.nrBonuriFiscale ?? null,
    dataOra: parsed.dataOra ?? null,
    totalNumerar: parsed.totalNumerar ?? null,
    totalCard: parsed.totalCard ?? null,
    totalCvc: parsed.totalCvc ?? null,
    motorina: buildBreakdown(mot),
    benzina95: buildBreakdown(benz),
    gaz: buildBreakdown(gaz),
    totalVanzari: parsed.totalVanzari ?? null,
    validationWarnings: warnings,
  };
}

/**
 * Builds a FuelBreakdown with proportional liters per payment type.
 * Prevents "0 L = 500 Lei" absurdity: if a payment type has an amount,
 * it also gets its proportional share of the total liters.
 */
function buildBreakdown(raw: any): FuelBreakdown {
  const litriTotal = raw?.litri ?? null;
  const total = raw?.total ?? null;
  const numerar = raw?.numerar ?? null;
  const card = raw?.card ?? null;
  const cvc = raw?.cvc ?? null;

  return {
    litriTotal,
    litriNumerar: propLitri(litriTotal, numerar, total),
    litriCard:    propLitri(litriTotal, card,    total),
    litriCvc:     propLitri(litriTotal, cvc,     total),
    total,
    numerar,
    card,
    cvc,
  };
}

/** Proportional liters: totalL × (amount / totalAmount), rounded to 3 decimals */
function propLitri(totalL: number | null, amount: number | null, totalAmt: number | null): number | null {
  if (totalL == null || amount == null || totalAmt == null || totalAmt === 0) return null;
  if (amount === 0) return 0;
  return Math.round(totalL * (amount / totalAmt) * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
