// Integrarea cu terminalul fiscal SmartOne Bank Pro.
//
// Aparatul e un POS Android cu imprimantă fiscală, care expune un API local: aplicația „Cashbox" de pe
// terminal ascultă pe HTTP, portul 8008, și primește documente de vânzare. Documentația e publică —
// docs.smartoneclub.com, secțiunea ECR Fiscal Cashbox — spre deosebire de protocolul DP-150, pentru care
// ni se cerea licență.
//
// DE CE CONTEAZĂ FORMA: toate sumele sunt în UNITĂȚI MINIME (bani), cantitățile cu trei zecimale, iar
// procentul de TVA tot ×100. Adică 780,00 lei se trimite ca 78000, o bucată ca 1000, iar 20% ca 2000. O
// greșeală de scară aici nu dă eroare — tipărește un bon cu suma greșită de o sută de ori.

export type LinieBon = {
  itemId: string;
  itemName: string;
  itemQRCode: string;
  itemQty: number;      // ×1000
  itemAmount: number;   // bani
  discount: number;
  itemTaxes: { taxName: string; taxPrc: number }[]; // taxPrc ×100
};

export type DocumentBon = {
  docNumber: string;
  employeeName: string;
  amount: number;       // bani
  currency: string;
  items: LinieBon[];
  payments: { cashAmount: number; cashlessAmount: number; otherAmount: number };
};

// Cecul nostru, așa cum îl întoarce `piese_cec` (migr. 393).
export type CecIntern = {
  doc_id: number;
  total: number;
  plata?: string;
  incasat?: number | null;
  linii: { nume: string; nume_bon?: string; articol: string; cant: number; pret: number; suma: number;
           cota_tva?: number }[];
};

const bani = (lei: number) => Math.round(Number(lei || 0) * 100);
const mii = (cant: number) => Math.round(Number(cant || 0) * 1000);

// Transformă cecul nostru în documentul pe care îl așteaptă terminalul.
//
// Numele trimis e `nume_bon` — cel scurt, decis în migr. 393 — nu denumirea lungă din catalog. Exact
// pentru asta a fost făcut: aparatul fiscal taie denumirea la o limită fixă, iar dacă n-o scurtăm noi,
// o taie el de unde apucă.
export function cecCatreSmartOne(cec: CecIntern, vanzator: string, moneda = 'MDL'): DocumentBon {
  const plata = (cec.plata || 'NUMERAR').toUpperCase();
  const total = bani(cec.total);
  return {
    docNumber: String(cec.doc_id),
    employeeName: vanzator || '',
    amount: total,
    currency: moneda,
    items: (cec.linii || []).map((l) => ({
      itemId: l.articol || '',
      itemName: l.nume_bon || l.nume || '',
      itemQRCode: '',
      itemQty: mii(l.cant),
      itemAmount: bani(l.suma),
      discount: 0,
      itemTaxes: [{ taxName: 'TVA', taxPrc: Math.round(Number(l.cota_tva ?? 20) * 100) }],
    })),
    // Numerarul și cardul se declară separat pe bon. `incasat` e ce a dat clientul; pe bon merge SUMA
    // DOCUMENTULUI, nu banii primiți — restul îl calculează casa.
    payments: {
      cashAmount: plata === 'NUMERAR' ? total : 0,
      cashlessAmount: plata === 'CARD' ? total : 0,
      otherAmount: plata !== 'NUMERAR' && plata !== 'CARD' ? total : 0,
    },
  };
}

// Semnătura cerută de terminal: base64 al hash-ului SHA-1, scris hexazecimal cu litere mici, calculat
// peste `data` CONCATENAT cu merchantID — în ordinea asta.
//
// Verificat pe exemplul din documentația oficială (merchant 9662a13f…, data din 1.4): iese exact
// semnătura publicată. Fără proba aceea, ordinea concatenării ar fi fost o presupunere.
export async function semneaza(dataB64: string, merchantId: string): Promise<string> {
  const buf = new TextEncoder().encode(dataB64 + merchantId);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return btoa(hex);
}

// Corpul cererii: `data` (JSON → UTF-8 → base64) și `sign`, trimise ca formular.
export async function corpCerere(doc: DocumentBon, merchantId: string): Promise<string> {
  const json = JSON.stringify(doc);
  // `unescape(encodeURIComponent(...))` face UTF-8 înainte de base64: `btoa` singur aruncă pe chirilice,
  // iar denumirile pieselor sunt aproape toate chirilice.
  const dataB64 = btoa(unescape(encodeURIComponent(json)));
  const sign = await semneaza(dataB64, merchantId);
  return `data=${encodeURIComponent(dataB64)}&sign=${encodeURIComponent(sign)}`;
}

// Adresa aparatului. `localhost` când programul rulează CHIAR PE terminal (browserul lui Android) —
// singurul caz în care un browser lasă o pagină HTTPS să cheme HTTP, fiindcă localhost e tratat ca
// origine de încredere. De pe alt calculator, prin rețea, cererea ar fi blocată ca „conținut mixt".
export const URL_TERMINAL = (gazda = 'localhost', port = 8008) => `http://${gazda}:${port}`;
