export type Locale = "ro" | "ru";

export const translations = {
  ro: {
    hero: "Biletul tău spre Nordul Moldovei!",
    from: "De la:",
    to: "Spre:",
    date: "Data:",
    search: "Sună șoferul",
    swap: "Inversează direcția",
    popular: "Destinații populare",
    selectDateTime: "Selectează data și ora",
    scrollHint: "↕ scroll pentru alte curse",
    calendarLocale: "ro-RO" as const,
  },
  ru: {
    hero: "Твой билет на Север Молдовы!",
    from: "Откуда:",
    to: "Куда:",
    date: "Дата:",
    search: "Позвони водителю",
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
