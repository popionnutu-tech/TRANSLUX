// ============================================================
// Enums
// ============================================================

export type UserRole = 'ADMIN' | 'CONTROLLER' | 'DIGITAL';
export type PointEnum = 'CHISINAU' | 'BALTI';
// Kind of bot operator. MAIN = perron operator (full report). TAXI_ZONE = Chișinău
// loading-zone operator who only enters the passenger count he brought (+geo).
export type OperatorKind = 'MAIN' | 'TAXI_ZONE';
export type DirectionEnum = 'CHISINAU_BALTI' | 'BALTI_CHISINAU';
export type ReportStatus = 'OK' | 'ABSENT' | 'FULL';

// Map: controller point → direction they report for
export const POINT_DIRECTION_MAP: Record<PointEnum, DirectionEnum> = {
  CHISINAU: 'CHISINAU_BALTI',
  BALTI: 'BALTI_CHISINAU',
};

// Labels in Romanian
export const POINT_LABELS: Record<PointEnum, string> = {
  CHISINAU: 'Chișinău',
  BALTI: 'Bălți',
};

export const DIRECTION_LABELS: Record<DirectionEnum, string> = {
  CHISINAU_BALTI: 'Chișinău → Bălți',
  BALTI_CHISINAU: 'Bălți → Chișinău',
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  OK: 'OK',
  ABSENT: 'Absent',
  FULL: 'Full',
};

// ============================================================
// Database Row Types
// ============================================================

export type AdminRole = 'ADMIN' | 'DISPATCHER' | 'GRAFIC' | 'OPERATOR_CAMERE' | 'ADMIN_CAMERE' | 'EVALUATOR_INCASARI' | 'CONTABIL' | 'DEPOZITAR' | 'VINZATOR' | 'MANAGER' | 'GESTIONAR';

export interface AdminAccount {
  id: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  name: string | null;
  active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  telegram_id: number | null;
  username: string | null;
  role: UserRole;
  point: PointEnum | null;
  operator_kind: OperatorKind;
  active: boolean;
  created_at: string;
}

export interface InviteToken {
  token: string;
  role: UserRole;
  point: PointEnum;
  created_by: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_user: string | null;
}

export interface Route {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface Driver {
  id: string;
  full_name: string;
  phone: string | null;
  active: boolean;
  created_at: string;
  cashin_sofer_id: string | null;
  is_lde: boolean;
  directions: string[];
}

export interface Vehicle {
  id: string;
  plate_number: string;
  active: boolean;
  created_at: string;
  is_lde: boolean;
  directions: string[];
}

export interface Trip {
  id: string;
  route_id: string;
  direction: DirectionEnum;
  departure_time: string; // HH:MM:SS
  crm_route_id: number | null;
  active: boolean;
  created_at: string;
}

export interface Report {
  id: string;
  report_date: string; // YYYY-MM-DD
  point: PointEnum;
  trip_id: string;
  driver_id: string | null;
  status: ReportStatus;
  passengers_count: number | null;
  exterior_ok: boolean | null;
  uniform_ok: boolean | null;
  auto_curat: boolean | null;
  reclama_ok: boolean | null;
  reclama_deadline: string | null;
  reclama_problem: 'bus' | 'panou_ruta' | 'ambele' | null;
  wash_grade: number | null;
  location_ok: boolean | null;
  vehicle_id: string | null;
  created_by_user: string;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
}

// Taxi-zone loading report (Chișinău): the count the taxi-zone operator brought
// for a trip. Lives separately from `reports`; the main report is unaffected.
export interface TaxiZoneReport {
  id: string;
  report_date: string; // YYYY-MM-DD
  trip_id: string;
  status: 'OK' | 'ABSENT';
  passengers_count: number | null; // null when status = 'ABSENT'
  location_ok: boolean | null;
  created_by_user: string;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
}

export interface DayValidation {
  id: string;
  user_id: string;
  validation_date: string; // YYYY-MM-DD
  validated_at: string;
}

export interface ReportPhoto {
  id: string;
  report_id: string;
  storage_key: string;
  telegram_file_id: string;
  file_unique_id: string | null;
  created_at: string;
}

export type ScheduleDirection = 'CHISINAU_NORD' | 'NORD_CHISINAU';

export const SCHEDULE_DIRECTION_LABELS: Record<ScheduleDirection, string> = {
  CHISINAU_NORD: 'Chișinău → Nord',
  NORD_CHISINAU: 'Nord → Chișinău',
};

export interface DailyAssignment {
  id: string;
  assignment_date: string; // YYYY-MM-DD
  schedule_id: number;
  direction: ScheduleDirection;
  trip_id: string | null;
  driver_id: string;
  vehicle_id: string | null;
  auto_copied: boolean;
  created_at: string;
}

// ============================================================
// Joined / View Types (for dashboard queries)
// ============================================================

export interface ReportWithDetails extends Report {
  route_name?: string;
  driver_name?: string;
  departure_time?: string;
  direction?: DirectionEnum;
  photos_count?: number;
}

// ============================================================
// SMM Monitoring
// ============================================================

export type SmmPlatform = 'TIKTOK' | 'FACEBOOK';

export const SMM_PLATFORM_LABELS: Record<SmmPlatform, string> = {
  TIKTOK: 'TikTok',
  FACEBOOK: 'Facebook',
};

export interface SmmAccount {
  id: string;
  platform: SmmPlatform;
  account_name: string;
  platform_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  active: boolean;
  created_at: string;
}

export interface SmmPost {
  id: string;
  account_id: string;
  platform_post_id: string;
  published_at: string;
  title: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  fetched_at: string;
}

export interface SmmDailyStat {
  id: string;
  account_id: string;
  stat_date: string;
  posts_count: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  created_at: string;
}

export interface SmmDailyStatWithAccount extends SmmDailyStat {
  account_name: string;
  platform: SmmPlatform;
}

// ============================================================
// Offers (promotional prices)
// ============================================================

export interface Offer {
  id: number;
  from_locality: string;
  to_locality: string;
  original_price: number;
  offer_price: number;
  active: boolean;
  created_at: string;
}

// ============================================================
// Facebook auto-reply bot
// ============================================================

export interface FbMessagingConfig {
  id: string;
  page_id: string;
  page_name: string;
  page_access_token: string;
  token_expires_at: string | null;
  system_prompt: string;
  enabled: boolean;
  auto_reply_comments: boolean;
  auto_reply_dm: boolean;
  created_at: string;
  updated_at: string;
}

export type FbConversationRole = 'user' | 'assistant';
export type FbConversationChannel = 'dm' | 'comment';

export interface FbConversation {
  id: number;
  page_id: string;
  psid: string;
  channel: FbConversationChannel;
  role: FbConversationRole;
  content: string;
  fb_message_id: string | null;
  created_at: string;
}

export interface FbEventUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  model?: string;
}

export interface FbEvent {
  id: number;
  event_id: string;
  event_type: string;
  page_id: string | null;
  sender_id: string | null;
  payload: unknown;
  reply_text: string | null;
  usage: FbEventUsage | null;
  processed_at: string | null;
  error: string | null;
  created_at: string;
}

// ============================================================
// LDE Module — Autopark autobuze
// Sursa: 203_lde_phase1_foundation.sql + Sinteza-interviuri-autopark.md
// LDE acoperă km, motorină, optimizare DT, optimizare livrări, salarii UZINE
// (categ 1-5). Salariile categ 6 (suburban dublu) și 7 (interurban) trăiesc
// în modulul «numerar» existent.
// ============================================================

// ── Enums ──

// Categoria de mașină din autopark
export type LdeVehicleCategory =
  | 'microbuz'
  | 'autobuz_mic'
  | 'autobuz_mare'
  | 'camion_marfa';

// Tipar schimburi per uzină
export type LdeShiftPattern =
  | 'S1_FIXED'              // doar 1 schimb fix
  | 'S1_S2_FIXED'           // 2 schimburi fixe
  | 'S1_S2_S3_FIXED'        // 3 schimburi fixe
  | 'WEEKLY_ROTATION'       // rotație săptămânală
  | 'MONTHLY_ROTATION';     // rotație lunară

// Unde parchează șoferul mașina peste noapte
export type LdeParkingLocation =
  | 'HOME'
  | 'BASE_BRICENI'
  | 'BASE_BALTI'
  | 'BASE_UNGHENI'
  | 'BASE_ORHEI'
  | 'BASE_FLORESTI'
  | 'OTHER';

// Motivul pentru care norma per mașină diferă de norma tipului
export type LdeOverrideReason =
  | 'reparatie_tehnica'
  | 'actualizare_norma'
  | 'verificare_norma';

// Numărul schimbului (1, 2 sau 3)
export type LdeShiftNumber = 1 | 2 | 3;

// Categoria de salariu LDE (doar șoferi uzine)
// 1 = DAF uzine
// 2 = Microbuze uzine
// 3 = SEBN/LEAR cu pauză
// 4 = Admin Bălți → SEBN
// 5 = LEAR Florești
export type LdeSalaryCategory = 1 | 2 | 3 | 4 | 5;

// ── Label maps (RO) ──

export const LDE_VEHICLE_CATEGORY_LABELS: Record<LdeVehicleCategory, string> = {
  microbuz: 'Microbuz',
  autobuz_mic: 'Autobuz mic',
  autobuz_mare: 'Autobuz mare',
  camion_marfa: 'Camion marfă',
};

export const LDE_SHIFT_PATTERN_LABELS: Record<LdeShiftPattern, string> = {
  S1_FIXED: 'Un schimb fix',
  S1_S2_FIXED: 'Două schimburi fixe',
  S1_S2_S3_FIXED: 'Trei schimburi fixe',
  WEEKLY_ROTATION: 'Rotație săptămânală',
  MONTHLY_ROTATION: 'Rotație lunară',
};

export const LDE_PARKING_LABELS: Record<LdeParkingLocation, string> = {
  HOME: 'Acasă',
  BASE_BRICENI: 'Bază Briceni',
  BASE_BALTI: 'Bază Bălți',
  BASE_UNGHENI: 'Bază Ungheni',
  BASE_ORHEI: 'Bază Orhei',
  BASE_FLORESTI: 'Bază Florești',
  OTHER: 'Altă locație',
};

export const LDE_SALARY_CATEGORY_LABELS: Record<LdeSalaryCategory, string> = {
  1: 'Cat. 1 — DAF uzine',
  2: 'Cat. 2 — Microbuze uzine',
  3: 'Cat. 3 — SEBN/LEAR cu pauză',
  4: 'Cat. 4 — Admin Bălți → SEBN',
  5: 'Cat. 5 — LEAR Florești',
};

// ── Interfaces (Database Rows) ──

// Tipuri de mașini din autopark (14 pasageri + 2 camioane)
export interface LdeVehicleType {
  id: string;                                 // 'SPRINTER_312', 'DAF', 'CRAFTER', etc.
  display_name: string;
  category: LdeVehicleCategory;
  norm_l_per_100km: number;                   // norma de bază (gol pentru camioane)
  norm_l_per_100km_loaded: number | null;     // doar camioane
  passenger_seats: number | null;             // NULL pentru camioane
  notes: string | null;
  created_at: string;
}

// Override normă per mașină (36 mașini cu consum real măsurat)
export interface LdeVehicleNorm {
  vehicle_id: string;                         // PK + FK la vehicles
  vehicle_type_id: string;
  measured_consumption_l_per_100km: number;
  measurement_date: string | null;            // YYYY-MM-DD
  in_repair: boolean;
  override_reason: LdeOverrideReason | null;
  override_notes: string | null;
  updated_at: string;
}

// Uzine (5: Draxelmaier-Bălți, LEAR-Ungheni, SEBN-Orhei, Trox-Briceni, LEAR-Florești)
export interface LdeUzina {
  id: string;                                 // 'DRAXELMAIER_BALTI', etc.
  display_name: string;
  city: string;
  shift_pattern: LdeShiftPattern;
  shift1_time: string | null;                 // '07:00-15:30'
  shift2_time: string | null;
  shift3_time: string | null;
  works_saturday: boolean;
  works_sunday: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
}

// Curse uzine (110 curse total)
export interface LdeFactoryRoute {
  id: string;
  uzina_id: string;
  route_number: number;                       // 1, 2, 3 ... per uzina
  stops_in_order: string;                     // "Dondușeni → Tîrnova → Maramonovca → Mîndîc"
  total_passengers: number | null;
  has_shift1: boolean;
  has_shift2: boolean;
  has_shift3: boolean;
  rotation_note: string | null;
  active: boolean;
  created_at: string;
}

// Detalii per schimb (pasageri + note)
export interface LdeFactoryRouteShift {
  id: string;
  route_id: string;
  shift_number: LdeShiftNumber;
  passengers_count: number;
  notes: string | null;
}

// Atribuire autobuze la un schimb (1+ autobuze per schimb; mașină 1:N rute)
export interface LdeFactoryRouteVehicle {
  id: string;
  route_shift_id: string;
  vehicle_id: string;
  is_primary: boolean;
  rotation_note: string | null;
}

// Extensii la drivers (locații + categoria de salariu LDE)
export interface LdeDriverExtras {
  driver_id: string;                          // PK + FK la drivers
  uzina_id: string | null;                    // NULL = interurban/suburban
  home_address: string | null;
  home_lat: number | null;
  home_lon: number | null;
  parking_location: LdeParkingLocation;
  // Doar șoferi LDE (cat 1-5). Cat 6 (suburban dublu) și 7 (interurban) vor trăi în «numerar».
  lde_salary_category: LdeSalaryCategory | null;
  shift1_start_address: string | null;
  shift2_start_address: string | null;
  notes: string | null;
  updated_at: string;
}

// Atribuire activă (cine pe ce mașină acum) + istoric
export interface LdeActiveAssignment {
  id: string;
  driver_id: string;
  vehicle_id: string;
  route_id: string | null;
  shift_number: LdeShiftNumber | null;
  valid_from: string;                         // YYYY-MM-DD
  valid_to: string | null;                    // NULL = atribuire activă acum
  notes: string | null;
  created_at: string;
}

// Audit log LDE (cine a schimbat normă, atribuire, etc.)
export interface LdeAuditLog {
  id: number;
  actor_admin_id: string | null;
  action: string;                             // 'create', 'update', 'delete', 'norm_override', 'inrepair'
  entity: string;                             // 'vehicle_norm', 'factory_route', etc.
  entity_id: string | null;
  before_data: unknown | null;
  after_data: unknown | null;
  notes: string | null;
  created_at: string;
}

// ── LDE Salarii UZINE (migrarea 208) — categoriile 1-5 ──
// Cat 6-7 (suburban/interurban) se calculează în modulul EXISTENT /numarare.

export type LdeSalaryRunStatus = 'draft' | 'approved' | 'paid';
export type LdeExtraOrderType = 'chisinau_admin' | 'persoana_fizica' | 'transport_extra' | 'altul';

export const LDE_SALARY_RUN_STATUS_LABELS: Record<LdeSalaryRunStatus, string> = {
  draft: 'Ciornă',
  approved: 'Aprobat',
  paid: 'Plătit',
};

export const LDE_EXTRA_ORDER_TYPE_LABELS: Record<LdeExtraOrderType, string> = {
  chisinau_admin: 'Cursă Chișinău (admin)',
  persoana_fizica: 'Comandă persoană fizică',
  transport_extra: 'Transport suplimentar',
  altul: 'Altul',
};

export interface LdeSalaryRun {
  id: string;
  period_month: string;                       // 'YYYY-MM-01'
  status: LdeSalaryRunStatus;
  generated_at: string;
  generated_by_admin_id: string | null;
  approved_at: string | null;
  approved_by_admin_id: string | null;
  paid_at: string | null;
  notes: string | null;
}

export interface LdeSalaryUzineMonthly {
  id: string;
  salary_run_id: string;
  driver_id: string;
  uzina_id: string;
  salary_category: LdeSalaryCategory;
  base_lei: number;
  km_surcharge_lei: number;
  weekend_double_lei: number;
  extra_orders_lei: number;
  school_lei: number;
  cash_orders_lei: number;
  spalare_lei: number;
  total_gross_lei: number;
  deduction_pererashod_lei: number;
  deduction_damages_lei: number;
  deduction_other_lei: number;
  total_net_lei: number;
  km_total: number;
  work_days: number;
  weekend_days: number;
  notes: string | null;
}

export interface LdeSalaryBreakdown {
  id: string;
  salary_monthly_id: string;
  work_date: string;
  vehicle_id: string | null;
  route_id: string | null;
  shift_number: LdeShiftNumber | null;
  km_total: number;
  is_weekend: boolean;
  day_amount_lei: number;
  school_amount_lei: number;
  extra_order_amount_lei: number;
  notes: string | null;
}

export interface LdeSchoolPeriod {
  period_month: string;                       // 'YYYY-MM-01'
  is_active: boolean;
  rate_per_day_lei: number;
  set_by_admin_id: string | null;
  set_at: string;
  notes: string | null;
}

export interface LdeExtraOrder {
  id: string;
  driver_id: string;
  work_date: string;
  order_type: LdeExtraOrderType;
  amount_lei: number;
  entered_by_admin_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface LdeFuelAlimentariCash {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  alimentat_at: string;
  litri: number;
  suma_lei: number;
  statie: string;
  ocr_source_file: string | null;
  ocr_confidence: number | null;
  entered_by_admin_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface LdeSalaryAudit {
  id: number;
  salary_monthly_id: string | null;
  field_changed: string;
  value_before: number | null;
  value_after: number | null;
  reason: string | null;
  changed_by_admin_id: string | null;
  changed_at: string;
}

// ── LDE Experimente (migrarea 212) — §6: baseline → test → comparație → decizie ──

// Ce se experimentează. 'vehicle_set' = doar un set de vehicule, fără rută anume.
export type LdeExperimentRouteKind =
  | 'uzina_factory'
  | 'interurban_v2'
  | 'suburban'
  | 'vehicle_set';

// Faza experimentului. baseline → test → done (sau cancelled oricând).
export type LdeExperimentStatus = 'baseline' | 'test' | 'done' | 'cancelled';

// Decizia finală (NULL până status=done).
export type LdeExperimentDecision = 'implement' | 'cancel';

export const LDE_EXPERIMENT_ROUTE_KIND_LABELS: Record<LdeExperimentRouteKind, string> = {
  uzina_factory: 'Cursă uzină',
  interurban_v2: 'Interurban',
  suburban: 'Suburban',
  vehicle_set: 'Set de vehicule',
};

export const LDE_EXPERIMENT_STATUS_LABELS: Record<LdeExperimentStatus, string> = {
  baseline: 'Baseline',
  test: 'În test',
  done: 'Finalizat',
  cancelled: 'Anulat',
};

export const LDE_EXPERIMENT_DECISION_LABELS: Record<LdeExperimentDecision, string> = {
  implement: 'Implementat',
  cancel: 'Anulat',
};

export interface LdeExperiment {
  id: string;
  name: string;
  hypothesis: string | null;
  route_kind: LdeExperimentRouteKind | null;
  route_id: string | null;                      // polimorfic pe route_kind (fără FK)
  vehicle_ids: string[];                         // vehiculele monitorizate (array Postgres)
  baseline_from: string | null;                  // YYYY-MM-DD
  baseline_to: string | null;
  test_from: string | null;                      // NULL până începe testul
  test_to: string | null;                        // NULL până se închide testul
  status: LdeExperimentStatus;
  decision: LdeExperimentDecision | null;        // NULL până status=done
  // Snapshot agregat la închiderea fiecărei faze (înghețat — nu se recalculează retroactiv)
  baseline_litri: number | null;
  baseline_lei: number | null;
  baseline_km: number | null;
  test_litri: number | null;
  test_lei: number | null;
  test_km: number | null;
  created_by_admin_id: string | null;
  notes: string | null;
  created_at: string;
}

// ── LDE Acte de recepție + facturare uzine (migrarea 213) ──
// Săptămânal: agregate (km/curse/pasageri) × model facturare → valoare act.
// Sursa unică a tipului LdeBillingModel e motorul PUR lde-receptie-calc
// (acolo îl consumă computeReceptieValue); îl re-exportăm aici pentru ca
// modulul de tipuri să rămână punctul central, fără dublare de declarație.
export type { LdeBillingModel } from './lde-receptie-calc.js';
import type { LdeBillingModel } from './lde-receptie-calc.js';

// Statusul unui act de recepție. draft = în lucru | trimis = expediat uzinei.
export type LdeReceptieStatus = 'draft' | 'trimis';

export const LDE_BILLING_MODEL_LABELS: Record<LdeBillingModel, string> = {
  per_cursa: 'Per cursă',
  per_pasager: 'Per pasager',
  per_km: 'Per km',
  fix_saptamanal: 'Fix săptămânal',
};

export const LDE_RECEPTIE_STATUS_LABELS: Record<LdeReceptieStatus, string> = {
  draft: 'Ciornă',
  trimis: 'Trimis',
};

// Modelul de facturare per uzină (tabel gol — adminul completează tarifele)
export interface LdeUzinaBilling {
  uzina_id: string;                           // PK + FK la lde_uzine
  billing_model: LdeBillingModel;
  rate_lei: number;                           // interpretat după billing_model
  active: boolean;
  notes: string | null;
  updated_at: string;
}

// Act de recepție săptămânal către o uzină
export interface LdeReceptieAct {
  id: string;
  uzina_id: string;
  week_from: string;                          // YYYY-MM-DD
  week_to: string;                            // YYYY-MM-DD
  total_km: number;
  total_curse: number;
  total_passengers: number;
  total_value_lei: number;                    // calculat de lde-receptie-calc
  billing_model: LdeBillingModel | null;      // snapshot model la generare
  rate_lei: number | null;                    // snapshot tarif la generare
  status: LdeReceptieStatus;
  generated_at: string;
  generated_by_admin_id: string | null;
  notes: string | null;
}
