/**
 * Ștergerea la 30 de zile (services/photoRetention.ts → runPeronPhotoRetention):
 * pozele de curățenie și de șofer mai vechi de 30 de zile dispar din Storage și
 * rândul primește `photo_deleted_at` (verdictele rămân); ping-urile GPS cu același
 * prag se șterg de tot. Pragul e lovit exact: 31 de zile → șters, 30 de zile fix →
 * rămâne (created_at < cutoff e strict), 29 de zile → rămâne. A doua rulare nu mai
 * atinge nimic. Spec: docs/specs/peron-app-e2e.md, S03 pasul 3.
 *
 * Nu trece prin HTTP — retenția e un job de noapte (scheduler.ts, 03:10), nu o rută.
 */
import { installMocks } from '../test/mocks.js'; // PRIMUL import: setează env-ul
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FakeSupabase, Row } from '../test/fakeSupabase.js';
import { IDS, seedDay, tripId, uid } from '../test/fixtures.js';
import { PHOTO_RETENTION_DAYS, retentionCutoff, runPeronPhotoRetention } from '../services/photoRetention.js';

vi.mock('../supabase.js', () => import('../test/mocks.js').then((m) => m.supabaseModuleFactory()));
vi.mock('@anthropic-ai/sdk', () => import('../test/mocks.js').then((m) => m.anthropicModuleFactory()));
vi.mock('../services/adminAlert.js', () => import('../test/mocks.js').then((m) => m.adminAlertModuleFactory()));

const DATE = '2026-06-10';
const NOW = new Date(`${DATE}T03:10:00+03:00`); // ora jobului din scheduler
const DAY_MS = 24 * 60 * 60 * 1000;
const BUCKET = 'report-photos';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

/** Momentul de acum `days` zile (fracțiile permit «30 de zile fix» vs «30 de zile și o secundă»). */
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

interface PhotoSeed {
  id: string;
  table: 'peron_cleaning_checks' | 'driver_appearance_checks';
  createdAt: Date;
  key: string;
  /** rând deja marcat (fișierul nu mai e în bucket) */
  alreadyDeletedAt?: string;
}

const cleaningRow = (s: PhotoSeed, zone: string, verdict: string): Row => ({
  id: s.id,
  check_date: ymd(s.createdAt),
  slot: 'DIMINEATA',
  zone,
  verdict,
  problems: verdict === 'MURDAR' ? ['praf'] : [],
  description: 'seed',
  storage_key: s.key,
  telegram_file_id: '',
  model: 'claude-opus-5',
  source: 'app',
  location_lat: null,
  location_lon: null,
  created_by_user: IDS.users.vitalie,
  created_at: s.createdAt.toISOString(),
  photo_deleted_at: s.alreadyDeletedAt ?? null,
});

const driverRow = (s: PhotoSeed): Row => ({
  id: s.id,
  check_date: ymd(s.createdAt),
  trip_id: tripId('CHISINAU', '06:55'),
  driver_id: IDS.drivers.ionMunteanu,
  storage_key: s.key,
  person_visible: true,
  uniform_ok_model: true,
  groomed_ok_model: true,
  uniform_ok: true,
  groomed_ok: true,
  description: 'seed',
  model: 'claude-opus-5',
  location_lat: null,
  location_lon: null,
  created_by_user: IDS.users.vitalie,
  created_at: s.createdAt.toISOString(),
  photo_deleted_at: s.alreadyDeletedAt ?? null,
});

// Pozele: 31 de zile (se șterg), 30 fix (rămân), 29 (rămân), una deja marcată la 40.
const PHOTOS: Record<string, PhotoSeed> = {
  clean31peron: { id: uid('c1', 1), table: 'peron_cleaning_checks', createdAt: daysAgo(31), key: `curatenie/${ymd(daysAgo(31))}/DIMINEATA/PERON-1.jpg` },
  clean31veceu: { id: uid('c1', 2), table: 'peron_cleaning_checks', createdAt: daysAgo(31), key: `curatenie/${ymd(daysAgo(31))}/DIMINEATA/VECEU-1.jpg` },
  clean30exact: { id: uid('c1', 3), table: 'peron_cleaning_checks', createdAt: daysAgo(30), key: `curatenie/${ymd(daysAgo(30))}/DIMINEATA/PERON-1.jpg` },
  clean29: { id: uid('c1', 4), table: 'peron_cleaning_checks', createdAt: daysAgo(29), key: `curatenie/${ymd(daysAgo(29))}/DIMINEATA/PERON-1.jpg` },
  clean40done: { id: uid('c1', 5), table: 'peron_cleaning_checks', createdAt: daysAgo(40), key: `curatenie/${ymd(daysAgo(40))}/DIMINEATA/PERON-1.jpg`, alreadyDeletedAt: daysAgo(9).toISOString() },
  driver31: { id: uid('d1', 1), table: 'driver_appearance_checks', createdAt: daysAgo(31), key: `soferi/${ymd(daysAgo(31))}/${tripId('CHISINAU', '06:55')}-1.jpg` },
  driver30exact: { id: uid('d1', 2), table: 'driver_appearance_checks', createdAt: daysAgo(30), key: `soferi/${ymd(daysAgo(30))}/${tripId('CHISINAU', '06:55')}-1.jpg` },
  driver29: { id: uid('d1', 3), table: 'driver_appearance_checks', createdAt: daysAgo(29), key: `soferi/${ymd(daysAgo(29))}/${tripId('CHISINAU', '06:55')}-1.jpg` },
};
const EXPIRED = ['clean31peron', 'clean31veceu', 'driver31'] as const;
const KEPT = ['clean30exact', 'clean29', 'driver30exact', 'driver29'] as const;

// Ping-urile GPS: aceleași praguri; 31 de zile se șterg de tot, 30 fix și 29 rămân.
const ping = (n: number, atDate: Date, userId: string): Row => ({
  id: uid('90', n), user_id: userId, point: 'CHISINAU', at: atDate.toISOString(), lat: 47.02, lon: 28.86, accuracy_m: 10, in_zone: true, created_at: atDate.toISOString(),
});
const PINGS = {
  p31a: ping(1, daysAgo(31), IDS.users.vitalie),
  p31b: ping(2, daysAgo(31.5), IDS.users.andrei),
  p30exact: ping(3, daysAgo(30), IDS.users.vitalie),
  p29: ping(4, daysAgo(29), IDS.users.vitalie),
  today: ping(5, new Date(NOW.getTime() - 60_000), IDS.users.vitalie),
};

let fake: FakeSupabase;
let firstRun: Awaited<ReturnType<typeof runPeronPhotoRetention>>;

const rowById = (id: string): Row => {
  const r = [...fake._tables.peron_cleaning_checks, ...fake._tables.driver_appearance_checks].find((x) => x.id === id);
  if (!r) throw new Error(`nu există rândul ${id}`);
  return r;
};
const removedKeys = () => fake._storageOps.filter((o) => o.op === 'remove').flatMap((o) => o.paths);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const seed = seedDay(DATE);
  for (const [name, s] of Object.entries(PHOTOS)) {
    seed.tables[s.table].push(s.table === 'peron_cleaning_checks' ? cleaningRow(s, name.includes('veceu') ? 'VECEU' : 'PERON', name === 'clean31veceu' ? 'MURDAR' : 'CURAT') : driverRow(s));
    if (!s.alreadyDeletedAt) seed.storage![BUCKET][s.key] = JPEG;
  }
  seed.tables.peron_presence_pings.push(...Object.values(PINGS));
  fake = installMocks(seed);
});

afterAll(() => {
  vi.useRealTimers();
});

// ════════════════════════════════════════════════════════════════════════════

describe('1. Pragul', () => {
  it('30 de zile; cutoff-ul e exact acum − 30 zile, iar seed-ul are 8 poze (7 fișiere) și 5 ping-uri', () => {
    expect(PHOTO_RETENTION_DAYS).toBe(30);
    expect(retentionCutoff(NOW)).toBe(daysAgo(30).toISOString());
    expect(fake._tables.peron_cleaning_checks).toHaveLength(5);
    expect(fake._tables.driver_appearance_checks).toHaveLength(3);
    expect(Object.keys(fake._storage[BUCKET])).toHaveLength(7);
    expect(fake._tables.peron_presence_pings).toHaveLength(5);
  });
});

describe('2. Prima rulare', () => {
  it('șterge 3 poze (2 curățenie + 1 șofer) și 2 ping-uri, fără eșecuri', async () => {
    firstRun = await runPeronPhotoRetention();
    expect(firstRun).toEqual({ deleted: 3, failed: 0, pings: 2 });
  });

  it('Storage a primit remove DOAR pentru cheile de 31 de zile, câte un lot per tabel; fișierele au dispărut', () => {
    const removeOps = fake._storageOps.filter((o) => o.op === 'remove');
    expect(removeOps).toHaveLength(2);
    expect(removeOps[0].paths.sort()).toEqual([PHOTOS.clean31peron.key, PHOTOS.clean31veceu.key].sort());
    expect(removeOps[1].paths).toEqual([PHOTOS.driver31.key]);
    for (const name of EXPIRED) expect(fake._storage[BUCKET][PHOTOS[name].key]).toBeUndefined();
    for (const name of KEPT) expect(fake._storage[BUCKET][PHOTOS[name].key]).toEqual(JPEG);
    expect(Object.keys(fake._storage[BUCKET])).toHaveLength(4);
  });

  it('photo_deleted_at = acum pe cele de 31 de zile; null pe 30 fix și 29; verdictele și rândurile rămân', () => {
    for (const name of EXPIRED) {
      expect(rowById(PHOTOS[name].id).photo_deleted_at).toBe(NOW.toISOString());
    }
    for (const name of KEPT) expect(rowById(PHOTOS[name].id).photo_deleted_at).toBeNull();
    expect(rowById(PHOTOS.clean31veceu.id)).toMatchObject({ verdict: 'MURDAR', problems: ['praf'], storage_key: PHOTOS.clean31veceu.key });
    expect(fake._tables.peron_cleaning_checks).toHaveLength(5);
    expect(fake._tables.driver_appearance_checks).toHaveLength(3);
  });

  it('rândul deja marcat (40 de zile) nu se atinge din nou', () => {
    expect(rowById(PHOTOS.clean40done.id).photo_deleted_at).toBe(PHOTOS.clean40done.alreadyDeletedAt);
    expect(removedKeys()).not.toContain(PHOTOS.clean40done.key);
  });

  it('ping-urile de 31 de zile au dispărut; 30 fix, 29 și cel de azi au rămas', () => {
    const ids = fake._tables.peron_presence_pings.map((p) => p.id).sort();
    expect(ids).toEqual([PINGS.p30exact.id, PINGS.p29.id, PINGS.today.id].sort());
  });
});

describe('3. A doua rulare, în același minut', () => {
  it('nu mai șterge nimic: 0 poze, 0 ping-uri, niciun remove nou', async () => {
    const removesBefore = fake._storageOps.filter((o) => o.op === 'remove').length;
    const second = await runPeronPhotoRetention();
    expect(second).toEqual({ deleted: 0, failed: 0, pings: 0 });
    expect(fake._storageOps.filter((o) => o.op === 'remove')).toHaveLength(removesBefore);
    expect(Object.keys(fake._storage[BUCKET])).toHaveLength(4);
    expect(fake._tables.peron_presence_pings).toHaveLength(3);
    for (const name of EXPIRED) expect(rowById(PHOTOS[name].id).photo_deleted_at).toBe(NOW.toISOString());
  });

  it('a doua zi la 03:10, cele de «30 fix» au 31 de zile și se șterg (poze 2, ping-uri 1)', async () => {
    const tomorrow = new Date(NOW.getTime() + DAY_MS);
    vi.setSystemTime(tomorrow);
    const third = await runPeronPhotoRetention();
    expect(third).toEqual({ deleted: 2, failed: 0, pings: 1 });
    expect(rowById(PHOTOS.clean30exact.id).photo_deleted_at).toBe(tomorrow.toISOString());
    expect(rowById(PHOTOS.driver30exact.id).photo_deleted_at).toBe(tomorrow.toISOString());
    expect(rowById(PHOTOS.clean29.id).photo_deleted_at).toBeNull();
    expect(fake._storage[BUCKET][PHOTOS.clean29.key]).toEqual(JPEG);
    expect(fake._storage[BUCKET][PHOTOS.driver29.key]).toEqual(JPEG);
    expect(fake._tables.peron_presence_pings.map((p) => p.id).sort()).toEqual([PINGS.p29.id, PINGS.today.id].sort());
  });
});
