// Телефон прописью для голосового агента — детерминированно, модель читает дословно.
// Нестандартный вход → null: промпт тогда честно говорит «номера нет» (безопаснее,
// чем неверный номер). Review 84fd74a, Minor #4.
const RU_DIGITS = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const RO_DIGITS = ['zero', 'unu', 'doi', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă'];

function spell(local: string, dict: string[]): string {
  const groups = [local.slice(0, 3), local.slice(3, 6), local.slice(6)];
  // Punct între grupuri, nu virgulă: TTS face pauză mai lungă — dictare lentă (Ion, 23.08).
  return groups.map((g) => g.split('').map((d) => dict[+d]).join(' ')).join('. ');
}

/** null, если номер не молдавский мобильный/фиксированный в каноническом виде. */
export function phoneSpoken(raw: string | null | undefined): { ru: string; ro: string } | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  let local: string | null = null;
  if (/^373[0-9]{8}$/.test(digits)) local = '0' + digits.slice(3);
  else if (/^0[0-9]{8}$/.test(digits)) local = digits;
  if (!local) return null;
  return { ru: spell(local, RU_DIGITS), ro: spell(local, RO_DIGITS) };
}
