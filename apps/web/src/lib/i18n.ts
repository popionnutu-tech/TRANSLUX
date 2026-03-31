export type Locale = "ro" | "ru";

export const translations = {
  ro: {
    hero: "Cu noi nu aștepți — cu noi pleci!",
    from: "De la:",
    to: "Spre:",
    date: "Data:",
    search: "Caută cursă",
    swap: "Inversează direcția",
    popular: "Destinații populare",
    selectDateTime: "Selectează data și ora",
    scrollHint: "↕ scroll pentru alte curse",
    calendarLocale: "ro-RO" as const,
  },
  ru: {
    hero: "С нами не ждёшь — с нами едешь!",
    from: "Откуда:",
    to: "Куда:",
    date: "Дата:",
    search: "Найти рейс",
    swap: "Поменять направление",
    popular: "Популярные направления",
    selectDateTime: "Выберите дату и время",
    scrollHint: "↕ прокрутите для других рейсов",
    calendarLocale: "ru-RU" as const,
  },
} as const;

export function t(locale: Locale) {
  return translations[locale];
}
