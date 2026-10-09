// Afișarea cursei ca bilet în lista de pe site (Ion, 09.10.2026: «să semene cu un bilet și să fie număr șofer și auto»).
// Reguli pure, testate în bilet-afisare.test.ts.

/**
 * Numărul de înmatriculare cum e pe plăcuța moldovenească: literele întâi («AKD 652»). În bază numerele stau și invers
 * («652AKD»); altă formă rămâne cum e, cu majuscule.
 */
export function placaAfisata(raw: string | null | undefined): string | null {
  const p = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!p) return null;
  const cifreIntai = p.match(/^(\d{3})([A-Z]{3})$/);
  if (cifreIntai) return `${cifreIntai[2]} ${cifreIntai[1]}`;
  const litereIntai = p.match(/^([A-Z]{2,3})(\d{3,4})$/);
  if (litereIntai) return `${litereIntai[1]} ${litereIntai[2]}`;
  return p;
}

/** «06:55» → «10:15» = «3 h 20» (trece și peste miezul nopții); fără sosire sau cu ore stricate → null. */
export function durataDrum(plecare: string, sosire: string | null | undefined): string | null {
  const m = (t: string | null | undefined) => {
    const x = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? "").trim());
    return x ? Number(x[1]) * 60 + Number(x[2]) : null;
  };
  const a = m(plecare), b = m(sosire);
  if (a == null || b == null) return null;
  let d = b - a;
  if (d <= 0) d += 1440;
  const h = Math.floor(d / 60), min = d % 60;
  return h ? `${h} h${min ? ` ${String(min).padStart(2, "0")}` : ""}` : `${min} min`;
}
