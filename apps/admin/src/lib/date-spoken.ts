// Ziua rostită în cuvinte pentru agentul vocal — determinist, modelul citește dosloven
// (același tipar ca time-spoken / phone-spoken).
// Motiv (apel real 24.08.2026, Bălți→Ocnița): modelul NU știe ce zi e azi. A primit
// cursele de AZI, le-a anunțat drept «mâine, 24 august», iar la «сегодня» a răspuns
// «pe azi nu sunt curse» — negând exact cursele pe care tocmai le primise.
// Serverul știe ziua; de aici încolo eticheta zilei vine GATA de citit.

const RO_MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Zilele săptămânii, indexate ca getUTCDay(): 0 = duminică.
const RO_WEEKDAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const RU_WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

// Data în română se rostește cu numeral cardinal («douăzeci și patru august»),
// excepția fiind ziua 1 («întâi august»).
const RO_DAY = ['', 'întâi', 'doi', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă', 'zece',
  'unsprezece', 'doisprezece', 'treisprezece', 'paisprezece', 'cincisprezece', 'șaisprezece',
  'șaptesprezece', 'optsprezece', 'nouăsprezece', 'douăzeci', 'douăzeci și unu', 'douăzeci și doi',
  'douăzeci și trei', 'douăzeci și patru', 'douăzeci și cinci', 'douăzeci și șase',
  'douăzeci și șapte', 'douăzeci și opt', 'douăzeci și nouă', 'treizeci', 'treizeci și unu'];

// Rusa cere ordinal la genitiv («двадцать четвёртого августа») — TTS-ul citește
// cifrele prost, deci tabelul e explicit, nu calculat.
const RU_DAY = ['', 'первого', 'второго', 'третьего', 'четвёртого', 'пятого', 'шестого', 'седьмого',
  'восьмого', 'девятого', 'десятого', 'одиннадцатого', 'двенадцатого', 'тринадцатого',
  'четырнадцатого', 'пятнадцатого', 'шестнадцатого', 'семнадцатого', 'восемнадцатого',
  'девятнадцатого', 'двадцатого', 'двадцать первого', 'двадцать второго', 'двадцать третьего',
  'двадцать четвёртого', 'двадцать пятого', 'двадцать шестого', 'двадцать седьмого',
  'двадцать восьмого', 'двадцать девятого', 'тридцатого', 'тридцать первого'];

function utcNoon(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Respinge datele imposibile («2026-02-31» pe care Date le rostogolește tăcut).
  return d.toISOString().slice(0, 10) === iso ? d : null;
}

/**
 * Eticheta zilei, gata de rostit: «azi, douăzeci și patru august» /
 * «сегодня, двадцать четвёртого августа». Relativ la `todayIso` (ziua Chișinăului).
 * null la dată invalidă — apelantul cade elegant pe formatul brut.
 */
export function dateSpoken(dateIso: string, todayIso: string): { ro: string; ru: string } | null {
  const d = utcNoon(dateIso);
  const today = utcNoon(todayIso);
  if (!d || !today) return null;

  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const day = d.getUTCDate();
  const dateRo = `${RO_DAY[day]} ${RO_MONTHS[d.getUTCMonth()]}`;
  const dateRu = `${RU_DAY[day]} ${RU_MONTHS[d.getUTCMonth()]}`;

  const prefix =
    diff === 0 ? { ro: 'azi', ru: 'сегодня' }
    : diff === 1 ? { ro: 'mâine', ru: 'завтра' }
    : diff === -1 ? { ro: 'ieri', ru: 'вчера' }
    : { ro: RO_WEEKDAYS[d.getUTCDay()], ru: RU_WEEKDAYS[d.getUTCDay()] };

  return { ro: `${prefix.ro}, ${dateRo}`, ru: `${prefix.ru}, ${dateRu}` };
}

// ---- Rezolvarea zilei cerute de client ----
// Modelul NU știe ce zi e azi și nu trebuie să afle: ceasul în prompt ar fi singurul
// element volatil dintr-un system cache-uit integral (~6k tokeni) — s-ar rescrie
// cache-ul la fiecare minut de convorbire. Deci modelul trimite CUVÂNTUL rostit de
// client, iar serverul îl transformă în dată. Același tipar: serverul calculează,
// modelul citește.

function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // DOAR punctuația finală: punctul din interior e separatorul zi-lună («30.08»).
    .replace(/[.,!?]+$/, '')
    .trim()
    // Prepoziția rostită firesc: «pe mâine», «в субботу», «la sâmbătă».
    .replace(/^(pe|la|in|на|в|во)\s+/, '')
    .trim();
}

const RELATIVE_DAYS: Record<string, number> = {
  azi: 0, astazi: 0, today: 0, сегодня: 0,
  maine: 1, tomorrow: 1, завтра: 1,
  poimaine: 2, послезавтра: 2,
};

// getUTCDay(): 0 = duminică. Rusa apare și la acuzativ («в субботу»), forma pe care
// o rostește clientul și pe care modelul o transmite mai departe ca atare.
const WEEKDAYS: Record<string, number> = {
  duminica: 0, luni: 1, marti: 2, miercuri: 3, joi: 4, vineri: 5, sambata: 6,
  воскресенье: 0, понедельник: 1, вторник: 2, среда: 3, четверг: 4, пятница: 5, суббота: 6,
  // Acuzativul care diferă de nominativ; restul zilelor coincid («в понедельник»).
  среду: 3, пятницу: 5, субботу: 6,
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Ziua căutării, din ce a rostit clientul. Acceptă:
 *   «azi»/«mâine»/«poimâine» și echivalentele ruse, ziua săptămânii (următoarea
 *   apariție, niciodată azi), DOAR ziua («30» — cea mai apropiată zi cu acest număr),
 *   «30.08» / «30-08» (zi-lună) și YYYY-MM-DD gata format. Luna și anul le pune serverul.
 * Orice altceva — un cuvânt nerecunoscut, «la weekend», «через неделю» — cade
 * pe ziua de azi, TĂCUT: clientul aude cursele altei zile fără nicio eroare.
 * ATENȚIE, aici plasa NU prinde: un YYYY-MM-DD bine format trece ca atare, chiar
 * dacă anul e inventat de model (2025-09-07 → 2025-09-07, zero curse). De aceea
 * contractul «doar cuvântul rostit, niciodată un an» stă în descrierea tool-ului
 * și în promptul agentului — el e singura barieră (audit 02.09).
 */
export function resolveVoiceDate(raw: string | undefined | null, todayIso: string): string {
  if (!raw) return todayIso;
  const w = normalizeWord(String(raw));
  if (!w) return todayIso;

  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
    const d = new Date(`${w}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === w ? w : todayIso;
  }

  // Object.hasOwn, nu `in`: «constructor» din prototip trecea drept zi și
  // toISOString arunca — 500 pe apel viu (security M4; tiparul din driver-name).
  if (Object.hasOwn(RELATIVE_DAYS, w)) return addDays(todayIso, RELATIVE_DAYS[w]);

  if (Object.hasOwn(WEEKDAYS, w)) {
    const today = new Date(`${todayIso}T12:00:00Z`);
    if (Number.isNaN(today.getTime())) return todayIso;
    // 1..7: «sâmbătă» rostit sâmbăta înseamnă sâmbăta viitoare — pentru azi
    // clientul spune «azi». Nu ghicim în favoarea zilei curente.
    const delta = ((WEEKDAYS[w] - today.getUTCDay() + 7) % 7) || 7;
    return addDays(todayIso, delta);
  }

  // DOAR ziua, fără lună și fără an («pe treizeci», «на тридцатое») — cazul obișnuit
  // la telefon: omul spune numărul zilei și atât. Luăm cea mai apropiată zi cu acest
  // număr, de azi înainte; luna și anul le găsim noi, sărind lunile care n-au ziua
  // (31 februarie nu există, deci «31» în februarie înseamnă 31 martie).
  const dOnly = w.match(/^(\d{1,2})$/);
  if (dOnly) {
    const day = Number(dOnly[1]);
    if (day >= 1 && day <= 31) {
      let year = Number(todayIso.slice(0, 4));
      let month = Number(todayIso.slice(5, 7));
      for (let i = 0; i < 24; i++) {
        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const probe = new Date(`${iso}T12:00:00Z`);
        if (!Number.isNaN(probe.getTime()) && probe.toISOString().slice(0, 10) === iso && iso >= todayIso) {
          return iso;
        }
        month += 1;
        if (month > 12) { month = 1; year += 1; }
      }
    }
    return todayIso;
  }

  // Zi-lună rostită («treizeci august» ajunge la model ca 30.08): anul îl punem noi,
  // iar dacă ziua a trecut deja în anul curent — anul următor.
  const dm = w.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const year = Number(todayIso.slice(0, 4));
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const probe = new Date(`${iso}T12:00:00Z`);
      if (!Number.isNaN(probe.getTime()) && probe.toISOString().slice(0, 10) === iso) {
        return iso >= todayIso ? iso : `${year + 1}${iso.slice(4)}`;
      }
    }
  }

  return todayIso;
}

// ---- Rezolvarea zilei în TRECUT (lucruri uitate) ----
// resolveVoiceDate e croit pe vânzare și rezolvă totul ÎNAINTE («22» rostit pe 24.08
// = 22 septembrie). Cursa în care s-a uitat un obiect e mereu în urmă — de aceea
// resolverul de aici e SEPARAT: «ieri»/«вчера» există, ziua săptămânii și numărul
// zilei se caută ÎNAPOI. Tool-ul de vânzare nu-l atinge.

const RELATIVE_DAYS_PAST: Record<string, number> = {
  azi: 0, astazi: 0, today: 0, сегодня: 0,
  ieri: -1, yesterday: -1, вчера: -1,
  alaltaieri: -2, позавчера: -2,
};

/**
 * Ziua cursei TRECUTE, din ce a rostit clientul. Acceptă:
 *   «azi»/«ieri»/«alaltăieri» și echivalentele ruse, ziua săptămânii (cea mai
 *   recentă apariție, azi inclus), DOAR ziua («22» — cea mai recentă zi cu acest
 *   număr, azi inclus), «22.08» (dacă pică în viitor — anul trecut) și YYYY-MM-DD
 *   (viitorul se taie la azi — modelul nu știe ce zi e).
 * Nimic rostit → azi (obiectele se uită cel mai des în cursa de azi).
 * Rostit dar NERECUNOSCUT («acum trei zile») → null: aici «azi» tăcut ar da
 * numărul unui șofer greșit cu toată încrederea (audit H2) — apelantul întreabă.
 */
export function resolveVoiceDatePast(raw: string | undefined | null, todayIso: string): string | null {
  if (!raw) return todayIso;
  const w = normalizeWord(String(raw));
  if (!w) return todayIso;

  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
    const d = new Date(`${w}T12:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== w) return null;
    return w <= todayIso ? w : todayIso;
  }

  if (Object.hasOwn(RELATIVE_DAYS_PAST, w)) return addDays(todayIso, RELATIVE_DAYS_PAST[w]);

  if (Object.hasOwn(WEEKDAYS, w)) {
    const today = new Date(`${todayIso}T12:00:00Z`);
    if (Number.isNaN(today.getTime())) return todayIso;
    // 0..-6: «sâmbătă» rostit sâmbăta = azi (cursa de mai devreme), altfel cea trecută.
    const delta = -((today.getUTCDay() - WEEKDAYS[w] + 7) % 7);
    return addDays(todayIso, delta);
  }

  // DOAR ziua («pe douăzeci și doi») — cea mai recentă zi cu acest număr, ÎNAPOI.
  const dOnly = w.match(/^(\d{1,2})$/);
  if (dOnly) {
    const day = Number(dOnly[1]);
    if (day >= 1 && day <= 31) {
      let year = Number(todayIso.slice(0, 4));
      let month = Number(todayIso.slice(5, 7));
      for (let i = 0; i < 24; i++) {
        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const probe = new Date(`${iso}T12:00:00Z`);
        if (!Number.isNaN(probe.getTime()) && probe.toISOString().slice(0, 10) === iso && iso <= todayIso) {
          return iso;
        }
        month -= 1;
        if (month < 1) { month = 12; year -= 1; }
      }
    }
    return null;
  }

  // Zi-lună («22.08»): anul curent; dacă pică în viitor — anul trecut.
  const dm = w.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const year = Number(todayIso.slice(0, 4));
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const probe = new Date(`${iso}T12:00:00Z`);
      if (!Number.isNaN(probe.getTime()) && probe.toISOString().slice(0, 10) === iso) {
        return iso <= todayIso ? iso : `${year - 1}${iso.slice(4)}`;
      }
    }
    return null;
  }

  return null;
}
