/**
 * Client Supabase fals, în memorie — pentru testele cap-coadă ale aplicației de
 * peron (docs/specs/peron-app-e2e.md). Nicio conexiune: tabelele sunt array-uri
 * de obiecte, Storage-ul e un map bucket → path → Buffer.
 *
 * Implementează DOAR ce folosesc serviciile botului. Inventarul metodelor din
 * `apps/bot/src` (grep din «Decizii», 08.09.2026):
 *
 *   .from(161) .select(95) .eq(138) .maybeSingle(33) .order(23) .is(22) .update(21)
 *   .in(20) .insert(17) .limit(16) .single(15) .gte(11) .upsert(9) .lt(8) .not(7)
 *   .lte(5) .delete(4) .contains(2) .or(2) .ilike(1) .gt(1)
 *   storage: .upload(5) .remove(3) .download(2)
 *   (.filter(29) și .match(2) sunt Array#filter / String#match, nu query-builder;
 *    .rpc / .range / .like / .neq nu apar — range/like/neq sunt totuși implementate
 *    fiindcă sunt cerute de spec.)
 *
 * Orice metodă neimplementată sau tabel care nu e în seed aruncă
 * `FakeSupabaseError` — mai bine roșu decât tăcere.
 *
 * Ce emulează din Postgres-ul real (ca testele să lovească aceleași erori ca
 * producția):
 *   - indexul unic parțial al rapoartelor active
 *     (report_date, point, trip_id) WHERE cancelled_at IS NULL → { code: '23505' }
 *   - unicitatea peron_app_sessions.token_hash, peron_app_link_codes.code (PK),
 *     vehicles.plate_number, day_validations (user_id, validation_date), users.telegram_id,
 *     routes.name, trips (route_id, direction, departure_time), bot_storage.key (PK),
 *     obligation_attempts (obligation_id, number), daily_assignments (schedule_id,
 *     assignment_date, direction)
 *   - default-uri de coloane: id uuid, created_at now, reports.source 'bot',
 *     peron_cleaning_checks.source 'bot', obligations.current_state 'created' etc.
 *   - coloană necunoscută la insert/update, pe tabelele cu coloane declarate →
 *     { code: 'PGRST204' } (cum răspunde PostgREST)
 *   - .single() cu 0 sau >1 rânduri → { code: 'PGRST116' }; .maybeSingle() cu >1 la fel
 *   - upsert fără onConflict → conflictul se caută pe cheia primară (ca PostgREST),
 *     iar un alt index unic încălcat dă 23505
 *   - select cu relații încorporate: `*, routes!inner(name)`, `drivers(full_name)`,
 *     `trips!inner(departure_time, ...)` — după FK-urile din RELATIONS
 *   - storage.upload fără { upsert: true } peste un obiect existent → eroare
 *     «The resource already exists»
 */
import { randomUUID } from 'crypto';

export type Row = Record<string, any>;

export interface Seed {
  tables: Record<string, Row[]>;
  /** bucket → path → conținut */
  storage?: Record<string, Record<string, Buffer>>;
}

export class FakeSupabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FakeSupabaseError';
  }
}

export interface PostgrestLikeError {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

export interface QueryResult<T = any> {
  data: T;
  error: PostgrestLikeError | null;
  count: number | null;
  status: number;
  statusText: string;
}

export interface StorageOp {
  op: 'upload' | 'remove' | 'download' | 'createSignedUrl';
  bucket: string;
  paths: string[];
  ok: boolean;
}

// ── Schema: chei, unicități, default-uri, relații ─────────────────────────────

interface UniqueIndex {
  name: string;
  cols: string[];
  /** index parțial: se aplică doar rândurilor pentru care `where` e true */
  where?: (row: Row) => boolean;
}

interface TableMeta {
  pk: string[];
  uniques: UniqueIndex[];
  defaults: Record<string, () => unknown>;
  /** dacă e declarat, orice altă coloană la insert/update → PGRST204 */
  columns?: string[];
  /** nume de relație (cum apare în select) → tabel + coloana FK din rândul curent */
  relations: Record<string, { table: string; fk: string }>;
}

const nowIso = () => new Date().toISOString();
const uuid = () => randomUUID();

let pingSeq = 0;

const COMMON: TableMeta = { pk: ['id'], uniques: [], defaults: { id: uuid, created_at: nowIso }, relations: {} };

const SCHEMA: Record<string, TableMeta> = {
  users: {
    ...COMMON,
    uniques: [{ name: 'users_telegram_id_key', cols: ['telegram_id'] }],
    defaults: { ...COMMON.defaults, role: () => 'CONTROLLER', active: () => true, operator_kind: () => 'MAIN', point: () => null, username: () => null, name: () => null, telegram_id: () => null },
  },
  routes: {
    ...COMMON,
    uniques: [{ name: 'routes_name_key', cols: ['name'] }],
    defaults: { ...COMMON.defaults, active: () => true },
  },
  drivers: {
    ...COMMON,
    defaults: { ...COMMON.defaults, active: () => true, is_lde: () => false, directions: () => [], phone: () => null, cashin_sofer_id: () => null },
  },
  vehicles: {
    ...COMMON,
    uniques: [{ name: 'vehicles_plate_number_key', cols: ['plate_number'] }],
    defaults: { ...COMMON.defaults, active: () => true, is_lde: () => false, directions: () => [] },
  },
  trips: {
    ...COMMON,
    uniques: [{ name: 'trips_route_id_direction_departure_time_key', cols: ['route_id', 'direction', 'departure_time'] }],
    defaults: { ...COMMON.defaults, active: () => true, crm_route_id: () => null, nord_town: () => null, nord_departure: () => null },
    relations: { routes: { table: 'routes', fk: 'route_id' } },
  },
  reports: {
    ...COMMON,
    columns: [
      'id', 'report_date', 'point', 'trip_id', 'driver_id', 'status', 'passengers_count', 'exterior_ok', 'uniform_ok',
      'loading_help_ok', 'auto_curat', 'reclama_ok', 'reclama_deadline', 'reclama_problem', 'wash_grade', 'ac_status',
      'heat_status', 'location_ok', 'vehicle_id', 'created_by_user', 'created_at', 'cancelled_at', 'cancelled_by',
      'source', 'location_lat', 'location_lon', 'location_accuracy_m', 'driver_check_id',
    ],
    uniques: [{ name: 'idx_reports_unique_active', cols: ['report_date', 'point', 'trip_id'], where: (r) => r.cancelled_at == null }],
    defaults: { ...COMMON.defaults, source: () => 'bot' },
    relations: {
      trips: { table: 'trips', fk: 'trip_id' },
      drivers: { table: 'drivers', fk: 'driver_id' },
      vehicles: { table: 'vehicles', fk: 'vehicle_id' },
    },
  },
  report_photos: {
    ...COMMON,
    columns: ['id', 'report_id', 'storage_key', 'telegram_file_id', 'file_unique_id', 'created_at'],
  },
  day_validations: {
    ...COMMON,
    columns: ['id', 'user_id', 'validation_date', 'validated_at'],
    uniques: [{ name: 'day_validations_user_id_validation_date_key', cols: ['user_id', 'validation_date'] }],
    defaults: { id: uuid, validated_at: nowIso },
  },
  daily_assignments: {
    ...COMMON,
    uniques: [{ name: 'daily_assignments_schedule_id_assignment_date_direction_key', cols: ['schedule_id', 'assignment_date', 'direction'] }],
    defaults: { ...COMMON.defaults, auto_copied: () => false, trip_id: () => null, vehicle_id: () => null },
    relations: {
      drivers: { table: 'drivers', fk: 'driver_id' },
      vehicles: { table: 'vehicles', fk: 'vehicle_id' },
      trips: { table: 'trips', fk: 'trip_id' },
    },
  },
  obligations: {
    ...COMMON,
    defaults: {
      ...COMMON.defaults,
      updated_at: nowIso,
      current_state: () => 'created',
      points: () => 30,
      rework_used: () => false,
      retry_number: () => 1,
      attachments: () => [],
      title: () => null,
      vehicle_plate: () => null,
      reclama_problem: () => null,
      recurring_template_id: () => null,
      goal: () => null,
      category: () => 'ALTELE',
      root_task_id: () => null,
    },
  },
  obligation_events: { ...COMMON, defaults: { id: uuid, created_at: nowIso, data: () => ({}) } },
  obligation_attempts: {
    ...COMMON,
    uniques: [{ name: 'obligation_attempts_obligation_id_number_key', cols: ['obligation_id', 'number'] }],
    defaults: { id: uuid, submitted_at: nowIso, verdict: () => 'pending', report_text: () => null, manager_comment: () => null, decided_at: () => null },
  },
  bot_storage: { pk: ['key'], uniques: [], defaults: { updated_at: nowIso }, relations: {} },
  invite_tokens: { pk: ['token'], uniques: [], defaults: { created_at: nowIso, used_at: () => null, used_by_user: () => null }, relations: {} },
  peron_cleaning_checks: {
    ...COMMON,
    columns: [
      'id', 'check_date', 'slot', 'zone', 'storage_key', 'telegram_file_id', 'verdict', 'problems', 'description', 'model',
      'created_by_user', 'created_at', 'source', 'location_lat', 'location_lon', 'photo_deleted_at',
    ],
    defaults: {
      ...COMMON.defaults,
      problems: () => [],
      description: () => null,
      model: () => null,
      created_by_user: () => null,
      source: () => 'bot',
      location_lat: () => null,
      location_lon: () => null,
      photo_deleted_at: () => null,
    },
  },
  driver_appearance_checks: {
    ...COMMON,
    columns: [
      'id', 'check_date', 'trip_id', 'driver_id', 'storage_key', 'person_visible', 'uniform_ok_model', 'groomed_ok_model',
      'uniform_ok', 'groomed_ok', 'description', 'model', 'location_lat', 'location_lon', 'photo_deleted_at',
      'created_by_user', 'created_at',
    ],
    defaults: {
      ...COMMON.defaults,
      driver_id: () => null,
      person_visible: () => null,
      uniform_ok_model: () => null,
      groomed_ok_model: () => null,
      uniform_ok: () => null,
      groomed_ok: () => null,
      description: () => null,
      model: () => null,
      location_lat: () => null,
      location_lon: () => null,
      photo_deleted_at: () => null,
      created_by_user: () => null,
    },
  },
  peron_presence_pings: {
    pk: ['id'],
    columns: ['id', 'user_id', 'point', 'at', 'lat', 'lon', 'accuracy_m', 'in_zone'],
    uniques: [],
    defaults: { id: () => ++pingSeq, accuracy_m: () => null },
    relations: {},
  },
  operator_trip_skips: {
    ...COMMON,
    columns: ['id', 'skip_date', 'point', 'trip_id', 'user_id', 'created_at'],
    uniques: [{ name: 'idx_operator_trip_skips_unique', cols: ['skip_date', 'point', 'trip_id'] }],
  },
  peron_app_link_codes: {
    pk: ['code'],
    columns: ['code', 'user_id', 'created_by', 'created_at', 'expires_at', 'used_at'],
    uniques: [],
    defaults: { created_at: nowIso, created_by: () => null, used_at: () => null },
    relations: {},
  },
  peron_app_sessions: {
    ...COMMON,
    columns: ['id', 'user_id', 'token_hash', 'device_label', 'created_at', 'last_seen_at', 'revoked_at'],
    uniques: [{ name: 'peron_app_sessions_token_hash_key', cols: ['token_hash'] }],
    defaults: { ...COMMON.defaults, device_label: () => null, last_seen_at: () => null, revoked_at: () => null },
  },
};

function metaFor(table: string): TableMeta {
  return SCHEMA[table] ?? COMMON;
}

// ── Erori în formatul PostgREST ──────────────────────────────────────────────

function pgError(code: string, message: string, details: string | null = null): PostgrestLikeError {
  return { code, message, details, hint: null };
}

const uniqueViolation = (idx: UniqueIndex) =>
  pgError('23505', `duplicate key value violates unique constraint "${idx.name}"`, `Key (${idx.cols.join(', ')}) already exists.`);

const unknownColumn = (table: string, col: string) =>
  pgError('PGRST204', `Could not find the '${col}' column of '${table}' in the schema cache`);

const noSingleRow = (n: number) =>
  pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${n} rows`);

// ── Select: proiecție + relații încorporate ──────────────────────────────────

type SelectItem =
  | { kind: 'all' }
  | { kind: 'col'; name: string; alias: string }
  | { kind: 'rel'; name: string; alias: string; inner: boolean; items: SelectItem[] };

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseSelect(select: string): SelectItem[] {
  return splitTopLevel(select).map((item): SelectItem => {
    if (item === '*') return { kind: 'all' };
    const paren = item.indexOf('(');
    if (paren === -1) {
      const [a, b] = item.split(':').map((x) => x.trim());
      return b ? { kind: 'col', name: b, alias: a } : { kind: 'col', name: a, alias: a };
    }
    const head = item.slice(0, paren).trim();
    const inside = item.slice(paren + 1, item.lastIndexOf(')'));
    const [aliasPart, namePart] = head.includes(':') ? head.split(':').map((x) => x.trim()) : [null, head];
    const inner = namePart.endsWith('!inner');
    const name = inner ? namePart.slice(0, -'!inner'.length) : namePart;
    return { kind: 'rel', name, alias: aliasPart ?? name, inner, items: parseSelect(inside) };
  });
}

// ── Filtre ───────────────────────────────────────────────────────────────────

type Filter = (row: Row) => boolean;

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function valueOf(row: Row, col: string): unknown {
  const v = row[col];
  return v === undefined ? null : v;
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function likeToRegex(pattern: string, flags: string): RegExp {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${esc}$`, flags);
}

function opFilter(col: string, op: string, val: unknown): Filter {
  switch (op) {
    case 'eq':
      return (r) => looseEq(valueOf(r, col), val);
    case 'neq':
      return (r) => !looseEq(valueOf(r, col), val);
    case 'is':
      return (r) => {
        const v = valueOf(r, col);
        if (val === null || val === 'null') return v == null;
        if (val === true || val === 'true') return v === true;
        if (val === false || val === 'false') return v === false;
        throw new FakeSupabaseError(`.is('${col}', ${String(val)}): doar null/true/false`);
      };
    case 'in':
      return (r) => {
        const v = valueOf(r, col);
        const list = Array.isArray(val) ? val : String(val).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
        return v != null && list.some((x) => looseEq(x, v));
      };
    case 'gt':
      return (r) => valueOf(r, col) != null && cmp(valueOf(r, col), val) > 0;
    case 'gte':
      return (r) => valueOf(r, col) != null && cmp(valueOf(r, col), val) >= 0;
    case 'lt':
      return (r) => valueOf(r, col) != null && cmp(valueOf(r, col), val) < 0;
    case 'lte':
      return (r) => valueOf(r, col) != null && cmp(valueOf(r, col), val) <= 0;
    case 'like':
      return (r) => typeof valueOf(r, col) === 'string' && likeToRegex(String(val), '').test(valueOf(r, col) as string);
    case 'ilike':
      return (r) => typeof valueOf(r, col) === 'string' && likeToRegex(String(val), 'i').test(valueOf(r, col) as string);
    case 'contains':
      return (r) => {
        const v = valueOf(r, col);
        if (Array.isArray(val)) return Array.isArray(v) && val.every((x) => v.some((y: unknown) => looseEq(x, y)));
        if (val && typeof val === 'object') return v != null && typeof v === 'object' && Object.entries(val).every(([k, x]) => looseEq((v as Row)[k], x));
        throw new FakeSupabaseError(`.contains('${col}', …): doar array sau obiect`);
      };
    default:
      throw new FakeSupabaseError(`neimplementat: operatorul '${op}' (coloana '${col}')`);
  }
}

/** Sintaxa PostgREST din .or('a.eq.1,b.not.is.null'). */
function parseOr(expr: string): Filter {
  const parts = splitTopLevel(expr).map((p) => {
    const segs = p.split('.');
    const col = segs.shift()!;
    let negate = false;
    if (segs[0] === 'not') {
      negate = true;
      segs.shift();
    }
    const op = segs.shift()!;
    const raw = segs.join('.');
    const val = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw;
    const f = opFilter(col, op, val);
    return negate ? (r: Row) => !f(r) : f;
  });
  return (r) => parts.some((f) => f(r));
}

// ── Query builder (lazy; se evaluează la await) ──────────────────────────────

type Mutation =
  | { kind: 'select' }
  | { kind: 'insert'; rows: Row[] }
  | { kind: 'update'; patch: Row }
  | { kind: 'upsert'; rows: Row[]; onConflict: string[] | null; ignoreDuplicates: boolean }
  | { kind: 'delete' };

interface Order {
  col: string;
  ascending: boolean;
  nullsFirst: boolean;
}

class FakeQueryBuilder implements PromiseLike<QueryResult> {
  private mutation: Mutation = { kind: 'select' };
  private selectStr: string | null = null;
  private countMode: 'exact' | null = null;
  private head = false;
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private rangeFromTo: [number, number] | null = null;
  private mode: 'many' | 'single' | 'maybeSingle' = 'many';

  constructor(
    private readonly store: FakeStore,
    private readonly table: string,
  ) {}

  // ── verbe ──
  select(columns = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): this {
    this.selectStr = columns;
    if (opts?.count) {
      if (opts.count !== 'exact') throw new FakeSupabaseError(`neimplementat: count '${opts.count}'`);
      this.countMode = 'exact';
    }
    if (opts?.head) this.head = true;
    return this;
  }

  insert(values: Row | Row[], opts?: { count?: 'exact' }): this {
    if (opts?.count) this.countMode = 'exact';
    this.mutation = { kind: 'insert', rows: Array.isArray(values) ? values : [values] };
    return this;
  }

  update(patch: Row, opts?: { count?: 'exact' }): this {
    if (opts?.count) this.countMode = 'exact';
    this.mutation = { kind: 'update', patch };
    return this;
  }

  upsert(values: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean; count?: 'exact' }): this {
    if (opts?.count) this.countMode = 'exact';
    this.mutation = {
      kind: 'upsert',
      rows: Array.isArray(values) ? values : [values],
      onConflict: opts?.onConflict ? opts.onConflict.split(',').map((s) => s.trim()) : null,
      ignoreDuplicates: !!opts?.ignoreDuplicates,
    };
    return this;
  }

  delete(opts?: { count?: 'exact' }): this {
    if (opts?.count) this.countMode = 'exact';
    this.mutation = { kind: 'delete' };
    return this;
  }

  // ── filtre ──
  eq(col: string, val: unknown): this { return this.addFilter(opFilter(col, 'eq', val)); }
  neq(col: string, val: unknown): this { return this.addFilter(opFilter(col, 'neq', val)); }
  is(col: string, val: unknown): this { return this.addFilter(opFilter(col, 'is', val)); }
  in(col: string, vals: unknown[]): this { return this.addFilter(opFilter(col, 'in', vals)); }
  gt(col: string, val: unknown): this { return this.addFilter(opFilter(col, 'gt', val)); }
  gte(col: string, val: unknown): this { return this.addFilter(opFilter(col, 'gte', val)); }
  lt(col: string, val: unknown): this { return this.addFilter(opFilter(col, 'lt', val)); }
  lte(col: string, val: unknown): this { return this.addFilter(opFilter(col, 'lte', val)); }
  like(col: string, pattern: string): this { return this.addFilter(opFilter(col, 'like', pattern)); }
  ilike(col: string, pattern: string): this { return this.addFilter(opFilter(col, 'ilike', pattern)); }
  contains(col: string, val: unknown): this { return this.addFilter(opFilter(col, 'contains', val)); }
  not(col: string, op: string, val: unknown): this {
    const f = opFilter(col, op, val);
    return this.addFilter((r) => !f(r));
  }
  or(expr: string): this { return this.addFilter(parseOr(expr)); }

  // ── modificatori ──
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    const ascending = opts?.ascending ?? true;
    // Postgres: NULLS LAST la ASC, NULLS FIRST la DESC
    this.orders.push({ col, ascending, nullsFirst: opts?.nullsFirst ?? !ascending });
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFromTo = [from, to];
    return this;
  }

  single(): this {
    this.mode = 'single';
    return this;
  }

  maybeSingle(): this {
    this.mode = 'maybeSingle';
    return this;
  }

  // ── thenable ──
  then<R1 = QueryResult, R2 = never>(
    onFulfilled?: ((v: QueryResult) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return new Promise<QueryResult>((resolve) => resolve(this.execute())).then(onFulfilled, onRejected);
  }

  private addFilter(f: Filter): this {
    this.filters.push(f);
    return this;
  }

  private matching(rows: Row[]): Row[] {
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }

  private execute(): QueryResult {
    const rows = this.store.table(this.table);
    switch (this.mutation.kind) {
      case 'select':
        return this.finish(this.shape(this.matching(rows)), null);
      case 'insert': {
        const err = this.store.insertRows(this.table, this.mutation.rows);
        if (!Array.isArray(err)) return this.fail(err);
        return this.finish(this.returning(err), this.countMode ? err.length : null);
      }
      case 'upsert': {
        const err = this.store.upsertRows(this.table, this.mutation.rows, this.mutation.onConflict, this.mutation.ignoreDuplicates);
        if (!Array.isArray(err)) return this.fail(err);
        return this.finish(this.returning(err), this.countMode ? err.length : null);
      }
      case 'update': {
        const targets = this.matching(rows);
        const err = this.store.updateRows(this.table, targets, this.mutation.patch);
        if (err) return this.fail(err);
        return this.finish(this.returning(targets), this.countMode ? targets.length : null);
      }
      case 'delete': {
        const targets = this.matching(rows);
        this.store.deleteRows(this.table, targets);
        return this.finish(this.returning(targets), this.countMode ? targets.length : null);
      }
    }
  }

  /** Rândurile scrise → ce întoarce `.select()` de după verb; fără select → null. */
  private returning(rows: Row[]): Row[] | null {
    if (this.selectStr === null) return null;
    return this.project(rows);
  }

  /** Pentru select: filtre → ordine → range/limit → proiecție. */
  private shape(rows: Row[]): Row[] {
    let out = rows.slice();
    for (const o of this.orders.slice().reverse()) {
      out.sort((a, b) => {
        const va = valueOf(a, o.col);
        const vb = valueOf(b, o.col);
        if (va == null && vb == null) return 0;
        if (va == null) return o.nullsFirst ? -1 : 1;
        if (vb == null) return o.nullsFirst ? 1 : -1;
        const c = cmp(va, vb);
        return o.ascending ? c : -c;
      });
    }
    if (this.rangeFromTo) out = out.slice(this.rangeFromTo[0], this.rangeFromTo[1] + 1);
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return this.project(out);
  }

  private project(rows: Row[]): Row[] {
    const items = parseSelect(this.selectStr ?? '*');
    const meta = metaFor(this.table);
    const out: Row[] = [];
    for (const row of rows) {
      const projected = this.projectRow(row, items, meta);
      if (projected) out.push(projected);
    }
    return out;
  }

  private projectRow(row: Row, items: SelectItem[], meta: TableMeta, table = this.table): Row | null {
    const obj: Row = {};
    for (const it of items) {
      if (it.kind === 'all') Object.assign(obj, structuredClone(row));
      else if (it.kind === 'col') obj[it.alias] = structuredClone(valueOf(row, it.name));
      else {
        const rel = meta.relations[it.name];
        if (!rel) throw new FakeSupabaseError(`neimplementat: relația '${it.name}' pe tabelul '${table}' (adaug-o în RELATIONS)`);
        const relMeta = metaFor(rel.table);
        const fkVal = valueOf(row, rel.fk);
        const related = fkVal == null ? null : this.store.table(rel.table).find((r) => looseEq(valueOf(r, relMeta.pk[0]), fkVal));
        if (!related) {
          if (it.inner) return null;
          obj[it.alias] = null;
        } else {
          obj[it.alias] = this.projectRow(related, it.items, relMeta, rel.table);
        }
      }
    }
    return obj;
  }

  private fail(error: PostgrestLikeError): QueryResult {
    return { data: null, error, count: null, status: error.code === '23505' ? 409 : 400, statusText: 'Bad Request' };
  }

  private finish(rows: Row[] | null, count: number | null): QueryResult {
    if (this.head) {
      return { data: null, error: null, count: rows ? rows.length : count, status: 200, statusText: 'OK' };
    }
    const c = this.countMode ? (count ?? rows?.length ?? 0) : null;
    if (this.mode === 'many') return { data: rows, error: null, count: c, status: rows === null ? 201 : 200, statusText: 'OK' };
    const n = rows?.length ?? 0;
    if (n === 1) return { data: rows![0], error: null, count: c, status: 200, statusText: 'OK' };
    if (this.mode === 'maybeSingle' && n === 0) return { data: null, error: null, count: c, status: 200, statusText: 'OK' };
    return { data: null, error: noSingleRow(n), count: c, status: 406, statusText: 'Not Acceptable' };
  }
}

// ── Store: tabelele + regulile de scriere ────────────────────────────────────

class FakeStore {
  constructor(readonly tables: Record<string, Row[]>) {}

  table(name: string): Row[] {
    const t = this.tables[name];
    if (!t) throw new FakeSupabaseError(`tabel necunoscut în seed: '${name}' (adaugă-l în Seed.tables, chiar gol)`);
    return t;
  }

  private checkColumns(table: string, row: Row): PostgrestLikeError | null {
    const cols = metaFor(table).columns;
    if (!cols) return null;
    for (const k of Object.keys(row)) if (!cols.includes(k)) return unknownColumn(table, k);
    return null;
  }

  private withDefaults(table: string, row: Row): Row {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) if (v !== undefined) out[k] = structuredClone(v);
    for (const [k, mk] of Object.entries(metaFor(table).defaults)) if (out[k] === undefined) out[k] = mk();
    for (const k of metaFor(table).columns ?? []) if (out[k] === undefined) out[k] = null;
    return out;
  }

  private violatedUnique(table: string, row: Row, existing: Row[]): UniqueIndex | null {
    for (const idx of metaFor(table).uniques.concat([{ name: `${table}_pkey`, cols: metaFor(table).pk }])) {
      if (idx.where && !idx.where(row)) continue;
      if (idx.cols.some((c) => valueOf(row, c) == null)) continue;
      const dup = existing.some(
        (e) => e !== row && (!idx.where || idx.where(e)) && idx.cols.every((c) => looseEq(valueOf(e, c), valueOf(row, c))),
      );
      if (dup) return idx;
    }
    return null;
  }

  /** Tranzacțional: la prima încălcare nu se scrie nimic. */
  insertRows(table: string, values: Row[]): Row[] | PostgrestLikeError {
    const t = this.table(table);
    const prepared: Row[] = [];
    for (const v of values) {
      const colErr = this.checkColumns(table, v);
      if (colErr) return colErr;
      const row = this.withDefaults(table, v);
      const idx = this.violatedUnique(table, row, t.concat(prepared));
      if (idx) return uniqueViolation(idx);
      prepared.push(row);
    }
    t.push(...prepared);
    return prepared;
  }

  upsertRows(table: string, values: Row[], onConflict: string[] | null, ignoreDuplicates: boolean): Row[] | PostgrestLikeError {
    const t = this.table(table);
    const target = onConflict ?? metaFor(table).pk;
    const written: Row[] = [];
    for (const v of values) {
      const colErr = this.checkColumns(table, v);
      if (colErr) return colErr;
      const hasTarget = target.every((c) => v[c] !== undefined && v[c] !== null);
      const existing = hasTarget ? t.find((e) => target.every((c) => looseEq(valueOf(e, c), v[c]))) : undefined;
      if (existing) {
        if (ignoreDuplicates) continue;
        const merged = { ...existing, ...structuredClone(v) };
        const idx = this.violatedUnique(table, merged, t.filter((e) => e !== existing));
        if (idx) return uniqueViolation(idx);
        Object.assign(existing, merged);
        written.push(existing);
      } else {
        const row = this.withDefaults(table, v);
        const idx = this.violatedUnique(table, row, t.concat(written));
        if (idx) return uniqueViolation(idx);
        t.push(row);
        written.push(row);
      }
    }
    return written;
  }

  updateRows(table: string, targets: Row[], patch: Row): PostgrestLikeError | null {
    const colErr = this.checkColumns(table, patch);
    if (colErr) return colErr;
    const t = this.table(table);
    const clean: Row = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
    // verificăm unicitățile pe rândurile modificate înainte de a scrie ceva
    for (const row of targets) {
      const candidate = { ...row, ...clean };
      const idx = this.violatedUnique(table, candidate, t.filter((e) => e !== row));
      if (idx) return uniqueViolation(idx);
    }
    for (const row of targets) Object.assign(row, structuredClone(clean));
    return null;
  }

  deleteRows(table: string, targets: Row[]): void {
    const t = this.table(table);
    for (const row of targets) {
      const i = t.indexOf(row);
      if (i !== -1) t.splice(i, 1);
    }
  }
}

// ── Storage ──────────────────────────────────────────────────────────────────

function toBuffer(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body));
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  throw new FakeSupabaseError('storage.upload: corp acceptat doar Buffer / Uint8Array / ArrayBuffer / string');
}

class FakeBucket {
  constructor(
    private readonly bucket: string,
    private readonly objects: Record<string, Buffer>,
    private readonly log: StorageOp[],
  ) {}

  async upload(path: string, body: unknown, opts?: { contentType?: string; upsert?: boolean }) {
    if (this.objects[path] !== undefined && !opts?.upsert) {
      this.log.push({ op: 'upload', bucket: this.bucket, paths: [path], ok: false });
      return { data: null, error: { message: 'The resource already exists', statusCode: '409', error: 'Duplicate' } };
    }
    this.objects[path] = toBuffer(body);
    this.log.push({ op: 'upload', bucket: this.bucket, paths: [path], ok: true });
    return { data: { path, id: randomUUID(), fullPath: `${this.bucket}/${path}` }, error: null };
  }

  /** Ca Supabase: obiectele inexistente nu dau eroare. */
  async remove(paths: string[]) {
    const removed: string[] = [];
    for (const p of paths) {
      if (this.objects[p] !== undefined) {
        delete this.objects[p];
        removed.push(p);
      }
    }
    this.log.push({ op: 'remove', bucket: this.bucket, paths, ok: true });
    return { data: removed.map((name) => ({ name, bucket_id: this.bucket })), error: null };
  }

  async download(path: string) {
    const buf = this.objects[path];
    this.log.push({ op: 'download', bucket: this.bucket, paths: [path], ok: buf !== undefined });
    if (buf === undefined) return { data: null, error: { message: 'Object not found', statusCode: '400', error: 'not_found' } };
    return { data: new Blob([new Uint8Array(buf)]), error: null };
  }

  async createSignedUrl(path: string, expiresIn: number) {
    const ok = this.objects[path] !== undefined;
    this.log.push({ op: 'createSignedUrl', bucket: this.bucket, paths: [path], ok });
    if (!ok) return { data: null, error: { message: 'Object not found', statusCode: '400', error: 'not_found' } };
    return { data: { signedUrl: `fake-storage://${this.bucket}/${path}?token=fake&expires=${expiresIn}` }, error: null };
  }
}

// ── Clientul ─────────────────────────────────────────────────────────────────

export interface FakeSupabase {
  from(table: string): FakeQueryBuilder;
  storage: { from(bucket: string): FakeBucket };
  /** tabelele, direct — pentru asserții și pentru a insera rânduri de test */
  _tables: Record<string, Row[]>;
  /** bucket → path → conținut */
  _storage: Record<string, Record<string, Buffer>>;
  /** toate operațiile de Storage, în ordine (upload / remove / download / createSignedUrl) */
  _storageOps: StorageOp[];
}

/**
 * Creează un client fals dintr-un seed. Seed-ul e copiat (structuredClone), deci
 * același `seedDay()` se poate refolosi în mai multe teste fără să se contamineze.
 */
export function createFakeSupabase(seed: Seed): FakeSupabase {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed.tables)) tables[name] = structuredClone(rows);
  const storage: Record<string, Record<string, Buffer>> = {};
  for (const [bucket, objects] of Object.entries(seed.storage ?? {})) {
    storage[bucket] = {};
    for (const [path, buf] of Object.entries(objects)) storage[bucket][path] = Buffer.from(buf);
  }
  const ops: StorageOp[] = [];
  const store = new FakeStore(tables);

  // Metodă de query-builder neimplementată (.rpc, .match, .textSearch, …) → FakeSupabaseError,
  // nu «is not a function».
  const guardBuilder = (b: FakeQueryBuilder): FakeQueryBuilder =>
    new Proxy(b, {
      get(target, prop, receiver) {
        if (prop in target || typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
        throw new FakeSupabaseError(`neimplementat: .${String(prop)}()`);
      },
    });

  const client = {
    from: (table: string) => guardBuilder(new FakeQueryBuilder(store, table)),
    storage: {
      from: (bucket: string) => {
        if (!storage[bucket]) storage[bucket] = {};
        return new FakeBucket(bucket, storage[bucket], ops);
      },
    },
    _tables: tables,
    _storage: storage,
    _storageOps: ops,
  };

  // Orice altă proprietate a clientului (rpc, auth, channel, …) → roșu, nu tăcere.
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop in target || typeof prop === 'symbol' || prop === 'then') return Reflect.get(target, prop, receiver);
      throw new FakeSupabaseError(`neimplementat: supabase.${String(prop)}`);
    },
  }) as FakeSupabase;
}
