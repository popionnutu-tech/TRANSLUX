// Helper pur (fără DB) pentru grila săptămânală — testabil izolat.

/** Dedupe+sortare și limitele multi-zi (max 7, ±31 zile de azi). Aruncă la depășire. */
export function valideazaZileMulti(dates: string[], today: string): string[] {
  const out = [...new Set(dates)].sort();
  if (out.length > 7) throw new Error('Maxim 7 zile per aplicare');
  const todayMs = new Date(`${today}T12:00:00Z`).getTime();
  for (const d of out) {
    const diffZile = Math.abs(new Date(`${d}T12:00:00Z`).getTime() - todayMs) / 86400000;
    if (diffZile > 31) throw new Error('Dată în afara intervalului permis');
  }
  return out;
}

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
