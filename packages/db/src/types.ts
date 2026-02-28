// ============================================================
// Enums
// ============================================================

export type UserRole = 'ADMIN' | 'CONTROLLER';
export type PointEnum = 'CHISINAU' | 'BALTI';
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

export interface AdminAccount {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface User {
  id: string;
  telegram_id: number | null;
  username: string | null;
  role: UserRole;
  point: PointEnum | null;
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
  active: boolean;
  created_at: string;
}

export interface Trip {
  id: string;
  route_id: string;
  direction: DirectionEnum;
  departure_time: string; // HH:MM:SS
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
  created_by_user: string;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  location_lat: number | null;
  location_lon: number | null;
  location_distance_m: number | null;
  location_ok: boolean | null;
  minutes_late: number | null;
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
