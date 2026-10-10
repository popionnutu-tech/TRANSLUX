// Verificarea de student făcută ÎNAINTE de căutarea cursei (Ion, 10.10.2026: «dacă apasă student să se solicite înainte de
// căutare cursă verificare acte în regim live; verificarea să fie pasul următor»). Jetonul de la panou (30 min, legat de
// telefon + nume) stă în sessionStorage al filei; formularul de cumpărare îl ia de aici și aplică −20% singur.

export const CHEIE_STUDENT = "tlx_student";

export interface StudentVerificat { jeton: string; expiraLa: string; nume: string; prenume: string; telefon: string }

export function citesteStudent(): StudentVerificat | null {
  try {
    const raw = sessionStorage.getItem(CHEIE_STUDENT);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<StudentVerificat>;
    if (typeof s.jeton !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(s.jeton)) return null;
    // Cu 2 minute de rezervă: jetonul trebuie să mai fie valabil când omul ajunge la plată.
    if (!s.expiraLa || Date.parse(s.expiraLa) - Date.now() < 120_000) { sessionStorage.removeItem(CHEIE_STUDENT); return null; }
    return { jeton: s.jeton, expiraLa: s.expiraLa, nume: String(s.nume ?? ""), prenume: String(s.prenume ?? ""), telefon: String(s.telefon ?? "") };
  } catch { return null; }
}

export function scrieStudent(s: StudentVerificat): void {
  try { sessionStorage.setItem(CHEIE_STUDENT, JSON.stringify(s)); } catch { /* stocare blocată: reducerea se cere din nou la plată */ }
}

/** Poza din cameră → JPEG ≤ 1600 px, ≤ 700 KB, orientată după EXIF (createImageBitmap), în base64 fără prefix. */
export async function laJpeg(f: File): Promise<string> {
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.85, 0.75, 0.65, 0.55]) {
    const url = c.toDataURL("image/jpeg", q);
    const b64 = url.slice(url.indexOf(",") + 1);
    if (b64.length * 0.75 <= 700_000) return b64;
  }
  throw new Error("prea_mare");
}
