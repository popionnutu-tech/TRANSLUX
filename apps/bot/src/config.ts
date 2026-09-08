import 'dotenv/config';

export const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  timezone: 'Europe/Chisinau',
  rateLimitPerMinute: 30,
  photoCaptureTimeoutMs: 2 * 60 * 1000, // 2 minutes
  reportCancelWindowMs: 10 * 60 * 1000, // 10 minutes

  // Geolocation stations
  stations: {
    CHISINAU: { lat: 47.023611, lon: 28.862750, radiusM: 150 },
    BALTI: { lat: 47.769806, lon: 27.941611, radiusM: 150 },
  },

  // Chișinău trips exempt from location check (first and last)
  chisinauExemptTimes: ['06:55', '20:00'],

  // Curățenie peron Chișinău: setul de dimineață e cerut înaintea primei curse,
  // setul de zi înaintea cursei de mai jos (Ion, 08.09: «la 16:25 fără poze nu poate»).
  cleaningGateTripTime: '16:25',

  // Poza șoferului (aplicația de peron): ce înseamnă «uniformă» pentru model.
  // Descrierea exactă (culoare, însemne) o dă Ion; până atunci verdictul e doar
  // propunere, operatorul confirmă. Singurul loc unde se descrie uniforma.
  DRIVER_UNIFORM_DESCRIPTION: 'îmbrăcăminte de serviciu cu însemne TRANSLUX',
} as const;

export function validateConfig() {
  if (!config.botToken) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!config.supabaseUrl) throw new Error('SUPABASE_URL is required');
  if (!config.supabaseKey) throw new Error('SUPABASE_SERVICE_KEY is required');
  if (!config.anthropicApiKey) console.warn('ANTHROPIC_API_KEY not set — Z-report OCR disabled');
}
