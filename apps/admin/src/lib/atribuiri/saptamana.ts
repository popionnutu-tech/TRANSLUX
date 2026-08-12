// Helper pur (fără DB) pentru grila săptămânală — testabil izolat.

/** Cele 7 date L→D (YYYY-MM-DD) ale săptămânii ISO care conține ziua dată. */
export function weekDates(todayYMD: string): string[] {
  const d = new Date(`${todayYMD}T12:00:00Z`);
  const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=Luni … 7=Duminică
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (wd - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setUTCDate(monday.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}
