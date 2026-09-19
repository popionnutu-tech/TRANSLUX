// Bucket-ul cu pozele operatorilor de peron (curatenie/, soferi/). Upload-ul și
// ștergerea stau într-un loc ca să fie folosite la fel din bot, din API-ul
// aplicației și din ștergerea automată după 30 de zile.
import { getSupabase } from '../supabase.js';

export const REPORT_PHOTOS_BUCKET = 'report-photos';

/** Urcă un JPEG; nu aruncă (linia din tabel e mai importantă decât fișierul). */
export async function uploadReportPhoto(storageKey: string, jpeg: Buffer): Promise<boolean> {
  const { error } = await getSupabase()
    .storage.from(REPORT_PHOTOS_BUCKET)
    .upload(storageKey, jpeg, { contentType: 'image/jpeg' });
  if (error) {
    console.error(`[photos] upload ${storageKey}:`, error.message);
    return false;
  }
  return true;
}

/** Șterge obiectele date; aruncă la eroare (apelantul decide ce marchează). */
export async function removeReportPhotos(storageKeys: string[]): Promise<void> {
  if (storageKeys.length === 0) return;
  const { error } = await getSupabase().storage.from(REPORT_PHOTOS_BUCKET).remove(storageKeys);
  if (error) throw error;
}

/** Descarcă un JPEG; null dacă lipsește sau bucket-ul nu răspunde (apelantul decide). */
export async function downloadReportPhoto(storageKey: string): Promise<Buffer | null> {
  const { data, error } = await getSupabase().storage.from(REPORT_PHOTOS_BUCKET).download(storageKey);
  if (error || !data) {
    if (error) console.error(`[photos] download ${storageKey}:`, error.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Copiază un obiect în același bucket (referințele șoferilor); nu aruncă. */
export async function copyReportPhoto(fromKey: string, toKey: string): Promise<boolean> {
  const { error } = await getSupabase().storage.from(REPORT_PHOTOS_BUCKET).copy(fromKey, toKey);
  if (error) {
    console.error(`[photos] copy ${fromKey} → ${toKey}:`, error.message);
    return false;
  }
  return true;
}
