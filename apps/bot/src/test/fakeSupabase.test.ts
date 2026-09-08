import { describe, expect, it } from 'vitest';
import { FakeSupabaseError, createFakeSupabase, parseSelect, type Row } from './fakeSupabase.js';
import { IDS, PLATES, seedDay, tripId } from './fixtures.js';

const DATE = '2026-06-10';
const fresh = () => createFakeSupabase(seedDay(DATE));

const reportRow = (overrides: Record<string, unknown> = {}) => ({
  report_date: DATE,
  point: 'CHISINAU',
  trip_id: tripId('CHISINAU', '06:55'),
  driver_id: IDS.drivers.ionMunteanu,
  status: 'OK',
  passengers_count: 12,
  exterior_ok: true,
  uniform_ok: true,
  loading_help_ok: true,
  auto_curat: true,
  reclama_ok: true,
  reclama_deadline: null,
  vehicle_id: IDS.vehicles.tcp998,
  created_by_user: IDS.users.vitalie,
  location_ok: null,
  ...overrides,
});

describe('fakeSupabase — filtre și ordine', () => {
  it('eq / in / is / not / order / limit', async () => {
    const db = fresh();
    const { data: ch } = await db.from('trips').select('id, departure_time').eq('direction', 'CHISINAU_BALTI').eq('active', true).order('departure_time');
    expect(ch).toHaveLength(29);
    expect(ch![0].departure_time).toBe('06:55:00');
    expect(ch![28].departure_time).toBe('20:00:00');

    const { data: desc } = await db.from('trips').select('departure_time').eq('direction', 'BALTI_CHISINAU').order('departure_time', { ascending: false }).limit(2);
    expect(desc!.map((r: Row) => r.departure_time)).toEqual(['20:20:00', '19:20:00']);

    const { data: two } = await db.from('drivers').select('full_name').in('id', [IDS.drivers.ionMunteanu, IDS.drivers.lde]).order('full_name');
    expect(two!.map((r: Row) => r.full_name)).toEqual(['Dumitru Camion', 'Ion Munteanu']);

    const { data: noPoint } = await db.from('users').select('username').is('point', null).order('username');
    expect(noPoint!.map((r: Row) => r.username)).toEqual(['admin_test', 'digital_test']);

    const { data: withPoint } = await db.from('users').select('username').not('point', 'is', null).order('username');
    expect(withPoint!.map((r: Row) => r.username)).toEqual(['andrei_balti', 'vitalie_peron']);
  });

  it('gte / lt / gt / lte / neq pe date ISO și numere; like / ilike / contains', async () => {
    const db = fresh();
    db._tables.peron_presence_pings.push(
      { id: 1, user_id: IDS.users.vitalie, point: 'CHISINAU', at: '2026-06-10T04:00:00.000Z', lat: 47, lon: 28, accuracy_m: 5, in_zone: true },
      { id: 2, user_id: IDS.users.vitalie, point: 'CHISINAU', at: '2026-06-10T05:00:00.000Z', lat: 47, lon: 28, accuracy_m: 50, in_zone: false },
      { id: 3, user_id: IDS.users.vitalie, point: 'CHISINAU', at: '2026-06-10T06:00:00.000Z', lat: 47, lon: 28, accuracy_m: null, in_zone: true },
    );
    const { data: mid } = await db.from('peron_presence_pings').select('id').gte('at', '2026-06-10T05:00:00.000Z').lt('at', '2026-06-10T06:00:00.000Z');
    expect(mid!.map((r: Row) => r.id)).toEqual([2]);
    const { data: acc } = await db.from('peron_presence_pings').select('id').gt('accuracy_m', 5).lte('accuracy_m', 50);
    expect(acc!.map((r: Row) => r.id)).toEqual([2]); // null nu trece de gt
    const { data: notFirst } = await db.from('peron_presence_pings').select('id').neq('id', 1).order('id');
    expect(notFirst!.map((r: Row) => r.id)).toEqual([2, 3]);

    const { data: ilike } = await db.from('drivers').select('full_name').ilike('full_name', '%munteanu%');
    expect(ilike!.map((r: Row) => r.full_name)).toEqual(['Ion Munteanu']);
    const { data: like } = await db.from('drivers').select('full_name').like('full_name', 'Ion%');
    expect(like).toHaveLength(1);
    const { data: likeCase } = await db.from('drivers').select('full_name').like('full_name', 'ion%');
    expect(likeCase).toHaveLength(0);

    const { data: inter } = await db.from('drivers').select('id').eq('active', true).eq('is_lde', false).contains('directions', ['interurban']);
    expect(inter).toHaveLength(4);
  });

  it('or() cu sintaxa PostgREST', async () => {
    const db = fresh();
    db._tables.reports.push(
      { ...reportRow({ exterior_ok: false }) },
      { ...reportRow({ trip_id: tripId('CHISINAU', '07:35'), reclama_ok: false }) },
      { ...reportRow({ trip_id: tripId('CHISINAU', '08:15') }) },
    );
    const { data } = await db.from('reports').select('trip_id').or('exterior_ok.eq.false,uniform_ok.eq.false,auto_curat.eq.false,reclama_ok.eq.false');
    expect(data!.map((r: Row) => r.trip_id).sort()).toEqual([tripId('CHISINAU', '06:55'), tripId('CHISINAU', '07:35')].sort());
    const { data: nn } = await db.from('obligations').select('id').or('source.eq.recurring,recurring_template_id.not.is.null');
    expect(nn).toHaveLength(0);
  });
});

describe('fakeSupabase — single / maybeSingle', () => {
  it('single: 1 rând → obiect; 0 rânduri → PGRST116; maybeSingle: 0 → null, >1 → PGRST116', async () => {
    const db = fresh();
    const one = await db.from('users').select('*').eq('telegram_id', 7115941429).single();
    expect(one.error).toBeNull();
    expect(one.data.username).toBe('vitalie_peron');

    const none = await db.from('users').select('*').eq('telegram_id', 1).single();
    expect(none.data).toBeNull();
    expect(none.error?.code).toBe('PGRST116');

    const maybeNone = await db.from('users').select('*').eq('telegram_id', 1).maybeSingle();
    expect(maybeNone).toMatchObject({ data: null, error: null });

    const many = await db.from('drivers').select('*').eq('active', true).maybeSingle();
    expect(many.error?.code).toBe('PGRST116');
  });

  it('count exact cu head întoarce doar count', async () => {
    const db = fresh();
    const { data, count, error } = await db.from('trips').select('*', { count: 'exact', head: true }).eq('direction', 'CHISINAU_BALTI').eq('active', true);
    expect(error).toBeNull();
    expect(data).toBeNull();
    expect(count).toBe(29);
  });
});

describe('fakeSupabase — insert / update / upsert / delete', () => {
  it('insert pune default-urile (id uuid, created_at, reports.source = bot) și întoarce rândul cu select().single()', async () => {
    const db = fresh();
    const { data, error } = await db.from('reports').insert(reportRow()).select().single();
    expect(error).toBeNull();
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(data.created_at)).not.toBeNaN();
    expect(data.source).toBe('bot');
    expect(data.reclama_problem).toBeNull(); // coloană declarată, netrimisă → null ca în Postgres
    expect(db._tables.reports).toHaveLength(1);

    const plain = await db.from('reports').insert(reportRow({ trip_id: tripId('CHISINAU', '07:35') }));
    expect(plain).toMatchObject({ data: null, error: null });
    expect(db._tables.reports).toHaveLength(2);
  });

  it('indexul unic parțial al rapoartelor active → 23505; un raport anulat lasă loc altuia', async () => {
    const db = fresh();
    expect((await db.from('reports').insert(reportRow())).error).toBeNull();
    const dup = await db.from('reports').insert(reportRow({ passengers_count: 3 }));
    expect(dup.error?.code).toBe('23505');
    expect(dup.error?.message).toContain('idx_reports_unique_active');
    expect(db._tables.reports).toHaveLength(1);

    await db.from('reports').update({ cancelled_at: new Date().toISOString(), cancelled_by: IDS.users.vitalie }).eq('trip_id', tripId('CHISINAU', '06:55'));
    const again = await db.from('reports').insert(reportRow({ passengers_count: 3 }));
    expect(again.error).toBeNull();
    expect(db._tables.reports).toHaveLength(2);
  });

  it('coloană necunoscută pe tabel declarat → PGRST204, fără scriere', async () => {
    const db = fresh();
    const { error } = await db.from('reports').insert(reportRow({ nu_exista: 1 }));
    expect(error?.code).toBe('PGRST204');
    expect(db._tables.reports).toHaveLength(0);
    const upd = await db.from('peron_app_sessions').update({ inventata: true }).eq('id', 'x');
    expect(upd.error?.code).toBe('PGRST204');
  });

  it('update().eq() modifică doar rândurile filtrate; .select() întoarce ce s-a modificat; maybeSingle după update', async () => {
    const db = fresh();
    const { data: upd } = await db.from('obligations').update({ current_state: 'cancelled' }).eq('id', IDS.reclamaTask).eq('current_state', 'sent').select('id, current_state').maybeSingle();
    expect(upd).toEqual({ id: IDS.reclamaTask, current_state: 'cancelled' });
    expect(db._tables.obligations[0].current_state).toBe('cancelled');

    // gardul pe stare: a doua oară nu mai prinde nimic
    const { data: none } = await db.from('obligations').update({ current_state: 'resolved' }).eq('id', IDS.reclamaTask).eq('current_state', 'sent').select('id').maybeSingle();
    expect(none).toBeNull();
    expect(db._tables.obligations[0].current_state).toBe('cancelled');
  });

  it('upsert cu onConflict: key (bot_storage) actualizează; fără onConflict cade pe PK, iar unicitatea day_validations dă 23505', async () => {
    const db = fresh();
    await db.from('bot_storage').upsert({ key: 'k', value: { a: 1 }, updated_at: 't1' }, { onConflict: 'key' });
    await db.from('bot_storage').upsert({ key: 'k', value: { a: 2 }, updated_at: 't2' }, { onConflict: 'key' });
    expect(db._tables.bot_storage).toEqual([{ key: 'k', value: { a: 2 }, updated_at: 't2' }]);

    const first = await db.from('day_validations').upsert({ user_id: IDS.users.vitalie, validation_date: DATE });
    expect(first.error).toBeNull();
    const second = await db.from('day_validations').upsert({ user_id: IDS.users.vitalie, validation_date: DATE });
    expect(second.error?.code).toBe('23505');
    expect(db._tables.day_validations).toHaveLength(1);
    expect(db._tables.day_validations[0].validated_at).toBeTruthy();
  });

  it('delete().eq() și delete({ count: exact }).lt()', async () => {
    const db = fresh();
    await db.from('bot_storage').insert([{ key: 'a', value: 1 }, { key: 'b', value: 2 }]);
    const del = await db.from('bot_storage').delete().eq('key', 'a');
    expect(del.error).toBeNull();
    expect(db._tables.bot_storage.map((r: Row) => r.key)).toEqual(['b']);

    db._tables.peron_presence_pings.push(
      { id: 1, user_id: 'u', point: 'BALTI', at: '2026-05-01T00:00:00.000Z', lat: 1, lon: 1, accuracy_m: null, in_zone: true },
      { id: 2, user_id: 'u', point: 'BALTI', at: '2026-06-09T00:00:00.000Z', lat: 1, lon: 1, accuracy_m: null, in_zone: true },
    );
    const { count, error } = await db.from('peron_presence_pings').delete({ count: 'exact' }).lt('at', '2026-06-01T00:00:00.000Z');
    expect(error).toBeNull();
    expect(count).toBe(1);
    expect(db._tables.peron_presence_pings.map((r: Row) => r.id)).toEqual([2]);
  });

  it('unicități: peron_app_sessions.token_hash, peron_app_link_codes.code (PK), vehicles.plate_number', async () => {
    const db = fresh();
    const sess = { user_id: IDS.users.vitalie, token_hash: 'h'.repeat(64), device_label: null, last_seen_at: null };
    expect((await db.from('peron_app_sessions').insert(sess)).error).toBeNull();
    expect((await db.from('peron_app_sessions').insert(sess)).error?.code).toBe('23505');

    const code = { code: '482913', user_id: IDS.users.vitalie, expires_at: '2026-06-11T00:00:00.000Z' };
    expect((await db.from('peron_app_link_codes').insert(code)).error).toBeNull();
    expect((await db.from('peron_app_link_codes').insert(code)).error?.code).toBe('23505');
    expect(db._tables.peron_app_link_codes[0]).not.toHaveProperty('id'); // PK e code, nu id

    const v = await db.from('vehicles').insert({ plate_number: PLATES.lyy735, directions: ['interurban'] }).select('id, plate_number').single();
    expect(v.error?.code).toBe('23505');
  });
});

describe('fakeSupabase — relații încorporate', () => {
  it('parseSelect înțelege *, coloane, alias și relații !inner', () => {
    expect(parseSelect('*, routes!inner(name)')).toEqual([
      { kind: 'all' },
      { kind: 'rel', name: 'routes', alias: 'routes', inner: true, items: [{ kind: 'col', name: 'name', alias: 'name' }] },
    ]);
    expect(parseSelect('driver_id, drivers(full_name), vehicles(plate_number)')).toHaveLength(3);
  });

  it('routes!inner(name) pe trips și drivers()/vehicles() pe daily_assignments (null când FK lipsește)', async () => {
    const db = fresh();
    const { data: trips } = await db.from('trips').select('*, routes!inner(name)').eq('direction', 'CHISINAU_BALTI').order('departure_time').limit(1);
    expect(trips![0].routes).toEqual({ name: 'Chișinău – Bălți' });
    expect(trips![0].departure_time).toBe('06:55:00');

    const { data: a } = await db.from('daily_assignments').select('driver_id, vehicle_id, drivers(full_name), vehicles(plate_number)').eq('crm_route_id', 1655).eq('assignment_date', DATE).single();
    expect(a).toEqual({ driver_id: IDS.drivers.ionMunteanu, vehicle_id: IDS.vehicles.tcp998, drivers: { full_name: 'Ion Munteanu' }, vehicles: { plate_number: PLATES.tcp998 } });

    await db.from('daily_assignments').update({ vehicle_id: null }).eq('crm_route_id', 1655);
    const { data: b } = await db.from('daily_assignments').select('vehicles(plate_number)').eq('crm_route_id', 1655).single();
    expect(b).toEqual({ vehicles: null });

    // !inner fără rând legat → rândul dispare
    db._tables.reports.push(reportRow({ trip_id: 'nu-exista' }));
    const { data: joined } = await db.from('reports').select('trip_id, trips!inner(departure_time, nord_town, nord_departure)').eq('report_date', DATE);
    expect(joined).toEqual([]);
  });
});

describe('fakeSupabase — storage', () => {
  it('upload / duplicat fără upsert / upsert / download.text() / remove / createSignedUrl', async () => {
    const db = fresh();
    const b = db.storage.from('report-photos');
    const up = await b.upload('curatenie/2026-06-10/DIMINEATA/PERON-1.jpg', Buffer.from([0xff, 0xd8, 0xff, 1]), { contentType: 'image/jpeg' });
    expect(up.error).toBeNull();
    expect(db._storage['report-photos']['curatenie/2026-06-10/DIMINEATA/PERON-1.jpg']).toHaveLength(4);

    const dup = await b.upload('curatenie/2026-06-10/DIMINEATA/PERON-1.jpg', Buffer.from('x'));
    expect(dup.error?.message).toMatch(/already exists/);

    await b.upload('digest/2026-06-10.json', Buffer.from(JSON.stringify({ date: '2026-06-10', violations: [] })), { contentType: 'application/json', upsert: true });
    const dl = await b.download('digest/2026-06-10.json');
    expect(dl.error).toBeNull();
    expect(JSON.parse(await dl.data!.text())).toEqual({ date: '2026-06-10', violations: [] });

    const missing = await b.download('nu/exista.json');
    expect(missing.data).toBeNull();
    expect(missing.error?.message).toMatch(/not found/i);

    const signed = await b.createSignedUrl('digest/2026-06-10.json', 60);
    expect(signed.data?.signedUrl).toContain('digest/2026-06-10.json');

    const rm = await b.remove(['digest/2026-06-10.json', 'nu/exista.json']);
    expect(rm.error).toBeNull();
    expect(db._storage['report-photos']).not.toHaveProperty('digest/2026-06-10.json');
    expect(db._storageOps.filter((o) => o.op === 'remove')).toHaveLength(1);
    expect(db._storageOps.at(-1)?.paths).toEqual(['digest/2026-06-10.json', 'nu/exista.json']);
  });
});

describe('fakeSupabase — roșu, nu tăcere', () => {
  it('tabel absent din seed, metodă de builder neimplementată, proprietate necunoscută a clientului → FakeSupabaseError', async () => {
    const db = fresh();
    expect(() => db.from('tabel_inventat').select('*')).not.toThrow(); // builder lazy…
    await expect(db.from('tabel_inventat').select('*')).rejects.toBeInstanceOf(FakeSupabaseError); // …aruncă la evaluare
    expect(() => (db.from('users') as any).textSearch('x', 'y')).toThrow(FakeSupabaseError);
    expect(() => (db as any).rpc('f')).toThrow(FakeSupabaseError);
    expect(() => (db as any).from('users').select('*, inventata(x)').then).not.toThrow();
    await expect(db.from('users').select('*, inventata(x)')).rejects.toThrow(/relația 'inventata'/);
  });

  it('seed-ul nu e mutat de client (fiecare createFakeSupabase e o copie)', async () => {
    const seed = seedDay(DATE);
    const db = createFakeSupabase(seed);
    await db.from('reports').insert(reportRow());
    expect(seed.tables.reports).toHaveLength(0);
    expect(createFakeSupabase(seed)._tables.reports).toHaveLength(0);
  });
});
