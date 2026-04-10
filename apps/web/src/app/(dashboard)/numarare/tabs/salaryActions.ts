'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// ─── Интерфейсы ───

export interface DayDetail {
  date: string;
  routeCount: number;
  routeType: string;
}

export interface CameraOperatorSalary {
  operatorId: string;
  operatorName: string;
  operatorEmail: string;
  interurbanRoutes: number;
  suburbanRoutes: number;
  pricePerInterurban: number;
  pricePerSuburban: number;
  totalSalary: number;
  dayDetails: DayDetail[];
}

export interface SalaryConfig {
  interurbanPrice: number;
  suburbanPrice: number;
}

// ─── Вспомогательные функции ───

function buildMonthBounds(year: number, month: number): { firstDay: string; lastDay: string } {
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDayDate = new Date(year, month, 0);
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
  return { firstDay, lastDay };
}

function hasAdminCamereAccess(role: string): boolean {
  return role === 'ADMIN_CAMERE' || role === 'ADMIN';
}

// ─── Загрузка тарифов ───

export async function getSalaryConfig(): Promise<SalaryConfig> {
  const session = await verifySession();
  if (!session) return { interurbanPrice: 0, suburbanPrice: 0 };

  const sb = getSupabase();

  const { data } = await sb
    .from('operator_salary_config')
    .select('route_type, price_per_route');

  const configByType: Record<string, number> = {};
  for (const row of data || []) {
    configByType[row.route_type] = Number(row.price_per_route);
  }

  return {
    interurbanPrice: configByType['interurban'] ?? 0,
    suburbanPrice: configByType['suburban'] ?? 0,
  };
}

// ─── Расчёт зарплаты операторов камер ───

export async function getCameraSalary(
  year: number,
  month: number,
): Promise<{ data?: CameraOperatorSalary[]; error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!hasAdminCamereAccess(session.role)) return { error: 'Acces interzis' };

  const sb = getSupabase();
  const { firstDay, lastDay } = buildMonthBounds(year, month);

  // Загружаем завершённые сессии с join на crm_routes (route_type) и operator (email, name)
  const { data: sessions, error: sessErr } = await sb
    .from('counting_sessions')
    .select(`
      id,
      assignment_date,
      operator_id,
      crm_routes!counting_sessions_crm_route_id_fkey(route_type),
      operator:admin_accounts!counting_sessions_operator_id_fkey(id, email, name)
    `)
    .eq('status', 'completed')
    .gte('assignment_date', firstDay)
    .lte('assignment_date', lastDay);

  if (sessErr) return { error: sessErr.message };

  const config = await getSalaryConfig();

  // Группировка по operator_id
  const operatorMap = new Map<string, {
    name: string;
    email: string;
    interurbanRoutes: number;
    suburbanRoutes: number;
    dayDetails: DayDetail[];
  }>();

  for (const s of sessions || []) {
    // Supabase возвращает join по FK как объект (single relation) — приводим через any
    const operatorRaw = s.operator as any;
    if (!operatorRaw) continue;

    const operatorId: string = operatorRaw.id;
    const operatorEmail: string = operatorRaw.email;
    const operatorName: string = operatorRaw.name || '';

    const routeRaw = s.crm_routes as any;
    const routeType: string = routeRaw?.route_type ?? 'interurban';

    if (!operatorMap.has(operatorId)) {
      operatorMap.set(operatorId, {
        name: operatorName,
        email: operatorEmail,
        interurbanRoutes: 0,
        suburbanRoutes: 0,
        dayDetails: [],
      });
    }

    const entry = operatorMap.get(operatorId)!;

    if (routeType === 'suburban') {
      entry.suburbanRoutes++;
    } else {
      entry.interurbanRoutes++;
    }

    entry.dayDetails.push({
      date: s.assignment_date,
      routeCount: 1,
      routeType,
    });
  }

  // Собираем результат, агрегируя dayDetails по дате + типу
  const result: CameraOperatorSalary[] = [];

  for (const [operatorId, info] of operatorMap) {
    const aggregatedDays = aggregateDayDetails(info.dayDetails);
    const totalSalary =
      info.interurbanRoutes * config.interurbanPrice +
      info.suburbanRoutes * config.suburbanPrice;

    result.push({
      operatorId,
      operatorName: info.name,
      operatorEmail: info.email,
      interurbanRoutes: info.interurbanRoutes,
      suburbanRoutes: info.suburbanRoutes,
      pricePerInterurban: config.interurbanPrice,
      pricePerSuburban: config.suburbanPrice,
      totalSalary,
      dayDetails: aggregatedDays,
    });
  }

  // Сортируем по имени/email для стабильного порядка
  result.sort((a, b) => {
    const nameA = a.operatorName || a.operatorEmail;
    const nameB = b.operatorName || b.operatorEmail;
    return nameA.localeCompare(nameB);
  });

  return { data: result };
}

/**
 * Агрегирует детали по дням: суммирует количество рейсов на одну дату + тип
 */
function aggregateDayDetails(raw: DayDetail[]): DayDetail[] {
  const map = new Map<string, DayDetail>();

  for (const d of raw) {
    const key = `${d.date}__${d.routeType}`;
    const existing = map.get(key);
    if (existing) {
      existing.routeCount += d.routeCount;
    } else {
      map.set(key, { ...d });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Обновление тарифа ───

export async function updateSalaryConfig(
  routeType: 'interurban' | 'suburban',
  pricePerRoute: number,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!hasAdminCamereAccess(session.role)) return { error: 'Acces interzis' };

  if (pricePerRoute < 0) return { error: 'Prețul nu poate fi negativ' };

  const sb = getSupabase();

  const { error } = await sb
    .from('operator_salary_config')
    .update({
      price_per_route: pricePerRoute,
      updated_at: new Date().toISOString(),
    })
    .eq('route_type', routeType);

  if (error) return { error: error.message };

  revalidatePath('/numarare');
  return {};
}
