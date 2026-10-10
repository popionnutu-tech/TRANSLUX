// Textele SMS ale biletelor (552), fără diacritice: un SMS cu diacritice trece în UCS-2 (70 de caractere în loc de 160)
// și costă de două ori. Rusa e oricum UCS-2. Linkul fără «https://» — telefoanele îl fac link și așa.

export function faraDiacritice(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ȘŞ]/g, 'S').replace(/[șş]/g, 's').replace(/[ȚŢ]/g, 'T').replace(/[țţ]/g, 't');
}

/** «13.10 06:55» în ora Chișinăului. */
export function ziOra(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
}

export interface BiletSms { lang: 'ro' | 'ru'; from: string; to: string; departure_at: string; cod: string; locuri: number[] }

const gazda = (bazaSite: string) => bazaSite.replace(/^https?:\/\//, '').replace(/\/+$/, '');
const link = (b: BiletSms, bazaSite: string) => `${gazda(bazaSite)}/${b.lang}/bilet/${b.cod}`;
const rand = (b: BiletSms) => {
  const loc = b.locuri.length ? (b.lang === 'ru' ? `, место ${b.locuri.join(',')}` : `, loc ${b.locuri.join(',')}`) : '';
  return `${faraDiacritice(b.from)}-${faraDiacritice(b.to)} ${ziOra(b.departure_at)}${loc}`;
};

/** Confirmarea după plată: cursa (și returul din același pachet), linkul și cum îl găsește pe site. */
export function textConfirmare(tur: BiletSms, retur: BiletSms | null, bazaSite: string): string {
  const site = gazda(bazaSite);
  if (tur.lang === 'ru') {
    return [`TRANSLUX: билет оплачен. ${rand(tur)}: ${link(tur, bazaSite)}`,
      retur ? `Обратно ${rand(retur)}: ${link(retur, bazaSite)}` : null,
      `Потеряли ссылку? ${site} > «Найти мой билет».`].filter(Boolean).join('\n');
  }
  return [`TRANSLUX: bilet platit. ${rand(tur)}: ${link(tur, bazaSite)}`,
    retur ? `Retur ${rand(retur)}: ${link(retur, bazaSite)}` : null,
    `Ai pierdut linkul? ${site} > «Gaseste biletul meu».`].filter(Boolean).join('\n');
}

/** «Găsește biletul meu»: biletele viitoare de pe număr (cel mult 3), fiecare cu linkul lui. */
export function textGaseste(lang: 'ro' | 'ru', bilete: BiletSms[], bazaSite: string): string {
  const linii = bilete.slice(0, 3).map((b) => `${rand(b)}: ${link(b, bazaSite)}`);
  return [lang === 'ru' ? 'TRANSLUX: ваши билеты' : 'TRANSLUX: biletele tale', ...linii].join('\n');
}
