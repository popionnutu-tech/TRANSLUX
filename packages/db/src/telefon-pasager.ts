/**
 * Telefonul pasagerului la biletele online (Ion, 10.10.2026: «pot fi și bilete din Ucraina cu +380 sau altă țară, dar de
 * bază e MD»). Moldova rămâne implicită: «069 123 456», «69123456», «+373 69 123 456» → «37369123456». Un număr străin
 * se scrie cu prefixul țării — «+380 67 123 4567» sau «00380…» — și se păstrează ca cifre E.164 fără «+»
 * («380671234567»), ca numerele moldovenești. Fără «+»/«00», doar forma moldovenească e recunoscută: «067 123 45 67»
 * (10 cifre cu 0) e ambiguu și cere prefixul. Telefoanele ȘOFERILOR rămân doar moldovenești (normalizeDriverPhone).
 */
export function normalizeazaTelefonPasager(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  let d = s.replace(/\D/g, '');
  if (!d) return null;
  const international = s.startsWith('+') || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);
  // Moldova (implicită)
  if (/^373\d{8}$/.test(d)) return d;
  if (!international && /^0\d{8}$/.test(d)) return `373${d.slice(1)}`;
  if (!international && /^\d{8}$/.test(d)) return `373${d}`;
  if (d.startsWith('373')) return null;          // prefixul Moldovei cu altă lungime = greșit, nu «altă țară»
  // Altă țară: E.164, prefixul țării nu începe cu 0, 8–15 cifre în total
  if (international && /^[1-9]\d{7,14}$/.test(d)) return d;
  return null;
}

/** «37369123456» → «+373 69 123 456»; un număr străin → «+380 671234567» (prefixul țării nu se ghicește la grupare). */
export function formateazaTelefonPasager(cifre: string): string {
  const d = String(cifre ?? '').replace(/\D/g, '');
  if (/^373\d{8}$/.test(d)) return `+373 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (/^380\d{9}$/.test(d)) return `+380 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return d ? `+${d}` : String(cifre ?? '');
}
