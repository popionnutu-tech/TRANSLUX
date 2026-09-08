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
