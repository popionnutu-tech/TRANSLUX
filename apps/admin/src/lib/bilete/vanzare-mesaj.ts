/**
 * Mesajul «bilet vândut» pentru tabul «Bilete online» al grupei (migr. 565), PUR — testat în vanzare-mesaj.test.ts.
 * Ion, 10.10.2026: «să îmi vie în grupă ai Translux bilete toate biletele cumpărate». O comandă = un mesaj; returul
 * din pachet (aceeași plată) intră în același mesaj.
 */

export interface ComandaVanduta {
  from_name: string;
  to_name: string;
  departure_at: string;
  seats: number;
  total: number;
  passenger_name: string;
  phone: string;
  reducere_tip: string | null;
  reducere_pct: number | null;
  telegram_id: number | null;
  locuri_alese: number[] | null;
  punct_urcare_nume_ro: string | null;
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ora(iso: string): string {
  return new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function lei(n: number): string {
  return Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2);
}

function cursa(c: ComandaVanduta): string {
  const loc = c.locuri_alese?.length ? ` · loc ${c.locuri_alese.join(', ')}` : '';
  const reducere = c.reducere_tip ? ` · ${c.reducere_tip === 'student' ? 'student' : 'retur'} −${c.reducere_pct ?? ''}%` : '';
  const rand = [`🚌 ${esc(c.from_name)} → ${esc(c.to_name)}, ${esc(ora(c.departure_at))}`,
    `${c.seats} ${c.seats === 1 ? 'loc' : 'locuri'}${loc} · ${lei(c.total)} lei${reducere}`];
  if (c.punct_urcare_nume_ro) rand.push(`Urcare: ${esc(c.punct_urcare_nume_ro)}`);
  return rand.join('\n');
}

export function mesajVanzare(comenzi: ComandaVanduta[]): string {
  const [prima] = comenzi;
  const total = comenzi.reduce((s, c) => s + Number(c.total), 0);
  const titlu = comenzi.length > 1 ? `🎫 <b>Bilet vândut (tur + retur) · ${lei(total)} lei</b>` : `🎫 <b>Bilet vândut · ${lei(total)} lei</b>`;
  const sursa = prima.telegram_id ? 'Telegram' : 'site';
  return [titlu, ...comenzi.map(cursa), `👤 ${esc(prima.passenger_name)} · +${esc(prima.phone)} · ${sursa}`].join('\n\n');
}
