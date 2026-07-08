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

// Meteo per punct pentru scoringul operatorilor (weather_daily_point):
// ambele orașe, ultimele zile via forecast API (past_days acoperă lag-ul arhivei).
// daily_weather (un oraș) rămâne neatins — îl folosește v_session_full.
const POINTS: Record<string, { lat: number; lon: number }> = {
  CHISINAU: { lat: 47.0236, lon: 28.8627 },
  BALTI: { lat: 47.7698, lon: 27.9416 },
};

export async function syncWeatherPoints(pastDays = 7): Promise<number> {
  const sb = getSupabase();
  let total = 0;
  for (const [point, { lat, lon }] of Object.entries(POINTS)) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_sum&past_days=${pastDays}&forecast_days=1&timezone=Europe%2FChisinau`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo error (${point}): ${res.status}`);
    const daily: { time: string[]; temperature_2m_max: (number | null)[]; precipitation_sum: (number | null)[] } =
      (await res.json()).daily;
    if (!daily?.time?.length) continue;
    const rows = daily.time.map((date, i) => ({
      point,
      date,
      temp_max: daily.temperature_2m_max[i] ?? null,
      precip_mm: daily.precipitation_sum[i] ?? null,
      fetched_at: new Date().toISOString(),
    }));
    const { error } = await sb.from('weather_daily_point').upsert(rows, { onConflict: 'point,date' });
    if (error) throw new Error(`weather_daily_point upsert (${point}): ${error.message}`);
    total += rows.length;
  }
  return total;
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
