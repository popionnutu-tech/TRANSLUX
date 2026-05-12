import { getSupabase } from './supabase';

const LATITUDE = 47.0;
const LONGITUDE = 28.85;
const HEAVY_RAIN_THRESHOLD_MM = 10;

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
}

export async function syncWeather(dateFrom: string, dateTo: string): Promise<number> {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${LATITUDE}&longitude=${LONGITUDE}&start_date=${dateFrom}&end_date=${dateTo}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FChisinau`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const daily: OpenMeteoDaily = json.daily;

  if (!daily?.time?.length) return 0;

  const rows = daily.time.map((date, i) => ({
    date,
    temp_max: daily.temperature_2m_max[i] ?? null,
    temp_min: daily.temperature_2m_min[i] ?? null,
    precipitation_mm: daily.precipitation_sum[i] ?? 0,
    rain_heavy: (daily.precipitation_sum[i] ?? 0) > HEAVY_RAIN_THRESHOLD_MM,
  }));

  const sb = getSupabase();
  const { error } = await sb.from('daily_weather').upsert(rows, { onConflict: 'date' });
  if (error) throw new Error(`Failed to upsert weather: ${error.message}`);

  return rows.length;
}
