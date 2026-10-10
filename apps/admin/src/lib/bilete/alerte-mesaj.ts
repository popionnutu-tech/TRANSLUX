/**
 * Mesajul Telegram cu alertele biletelor online (ION-207), PUR — testat în alerte-mesaj.test.ts.
 * Ion: «alertele să ajungă la mine». Un mesaj pe tick al împăcării, cel mult 20 de alerte, HTML scăpat.
 */

export interface AlertaPentruMesaj {
  tip: string;
  detalii: string | null;
  moment: string;
  comanda: { from_name: string; to_name: string; departure_at: string; passenger_name: string; phone: string; total: number } | null;
}

const TIPURI: Record<string, string> = {
  platita_fara_bilet: '💳 Plată primită fără bilet',
  suma_nepotrivita: '⚠️ Suma plătită nu se potrivește',
  refund_necunoscut: '❓ Refund fără răspuns de la bancă',
  refund_respins: '⛔ Refund respins de bancă',
  cursa_fara_sofer: '🚌 Cursă vândută fără șofer în grafic',
  sofer_nelegat: '📵 Cursă vândută cu șofer nelegat de Telegram',
  urcat_pe_anulat: '⚠️ Urcare pe bilet anulat',
  creare_esuata: '⚠️ Comanda nu a putut porni plata',
  plafon_atins: '🛑 Plafon de comenzi atins',
  refund_pe_zi_confirmata: '↩️ Returnare după plecarea cursei',
  email_esuat: '✉️ Biletul nu a plecat pe e-mail',
  retur_cerere: '↩️ Cerere de returnare din Telegram',
  // 546: promoțiile Bălți ⇄ Chișinău
  retur_tur_anulat: '🎟 Retur −20% plătit pe un tur anulat/folosit',
  cota_depasita: '🚌 Cota online a cursei depășită la plată',
  plafon_student: '🎓 Limita studentului depășită la plată',
  ai_eroare: '🤖 Verificarea carnetelor nu merge (AI)',
  plafon_ai: '🛑 Plafonul zilnic al verificărilor AI atins',
};

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ora(iso: string): string {
  return new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function eticheta(tip: string): string {
  return TIPURI[tip] ?? `⚠️ ${tip}`;
}

export function mesajAlerte(alerte: AlertaPentruMesaj[], urlPanou: string): string {
  const blocuri = alerte.slice(0, 20).map((a) => {
    const rand = [`<b>${esc(eticheta(a.tip))}</b>`];
    if (a.comanda) {
      rand.push(`${esc(a.comanda.from_name)} → ${esc(a.comanda.to_name)}, ${esc(ora(a.comanda.departure_at))}`);
      rand.push(`${esc(a.comanda.passenger_name)} · +${esc(a.comanda.phone)} · ${Number(a.comanda.total).toFixed(2)} lei`);
    }
    if (a.detalii) rand.push(`<i>${esc(a.detalii.slice(0, 200))}</i>`);
    return rand.join('\n');
  });
  const rest = alerte.length > 20 ? `\n\n…și încă ${alerte.length - 20}.` : '';
  return `🎫 <b>Bilete online: ${alerte.length === 1 ? 'o alertă' : `${alerte.length} alerte`}</b>\n\n${blocuri.join('\n\n')}${rest}\n\n<a href="${esc(urlPanou)}">Deschide «Bilete online»</a>`;
}
