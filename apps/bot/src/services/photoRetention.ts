// Pozele operatorilor de peron (curatenie/, soferi/) se păstrează 30 de zile
// (Ion, 08.09), apoi fișierul dispare din bucket; linia din tabel rămâne cu
// photo_deleted_at, verdictele sunt permanente. Rulează zilnic la 03:10 din
// scheduler.ts. Ștergerea din bucket merge în loturi de 100; un lot care pică
// nu se marchează și se reia a doua zi.
import { getExpiredPhotos, markPhotosDeleted, type PhotoTable } from './db.js';
import { removeReportPhotos } from './photoStorage.js';

export const PHOTO_RETENTION_DAYS = 30;
export const RETENTION_BATCH = 100;
const TABLES: PhotoTable[] = ['peron_cleaning_checks', 'driver_appearance_checks'];

/** Pragul: liniile cu created_at mai vechi decât acest moment își pierd fișierul. */
export function retentionCutoff(now: Date, days = PHOTO_RETENTION_DAYS): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface RetentionStats {
  deleted: number;
  failed: number;
}

/** O rulare completă pe ambele tabele; întoarce câte fișiere s-au șters. */
export async function runPeronPhotoRetention(now = new Date()): Promise<RetentionStats> {
  const cutoff = retentionCutoff(now);
  const stats: RetentionStats = { deleted: 0, failed: 0 };
  for (const table of TABLES) {
    const rows = await getExpiredPhotos(table, cutoff);
    for (const batch of chunk(rows, RETENTION_BATCH)) {
      try {
        await removeReportPhotos(batch.map((r) => r.storage_key).filter((k) => k));
        await markPhotosDeleted(table, batch.map((r) => r.id));
        stats.deleted += batch.length;
      } catch (err) {
        stats.failed += batch.length;
        console.error(`[photos] retention ${table}: lot de ${batch.length} a picat:`, err);
      }
    }
  }
  return stats;
}
