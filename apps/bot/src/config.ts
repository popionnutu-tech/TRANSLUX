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

  // Zile fără operator la punct (ISO: 1 = luni … 7 = duminică). Vitalie (09.09):
  // «Vinerea? Cum fără fotografie» — vineri nu e operator la Chișinău, aplicația
  // arată «zi fără operator», rutele de scriere refuză (409 DAY_OFF), digestul nu
  // reclamă poze și prezență lipsă.
  noOperatorWeekdays: { CHISINAU: [5], BALTI: [] },

  // Poza șoferului (aplicația de peron): ce înseamnă «uniformă» pentru model.
  // Ion (interviu 09.09): «tricoul vișiniu, sau cămașă albă ori albastru-deschis
  // într-o singură culoare (cămășile băgate în pantaloni)». Ion 24.09 (ION-46, poza
  // lui Vitalic de la Gara Chișinău): vesta peste cămașă «e OK, doar cămașa să fie
  // albastră deschisă sau albă». Ion 01.10 (ION-164, poza lui Cramari în cămașă
  // albă de in cu guler tunică): «asta nu e uniforma», «regula stricta camasa
  // classica». Tot 01.10, la poza lui Strasnii: bretelele «țin pantalonii» — sunt OK. Ion 04.10 (ION-227,
  // poza lui Mariciuc: pulover negru cu mâneci peste cămașă bleu, gulerul la vedere): «e cu uniforma». Singurul loc unde se descrie uniforma; verdictul
  // modelului e final.
  DRIVER_UNIFORM_DESCRIPTION:
    'tricou vișiniu (bordo) cu emblema TRANSLUX pe piept, SAU cămașă clasică (de birou) cu guler întors și nasturi pe toată lungimea, albă ori bleu (albastru-deschis), într-o singură culoare (fără carouri, fără dungi, fără model), băgată în pantaloni; cămașa de in sau de vară, cu guler tunică (guler mic drept) sau fără guler, polo-ul și cămașa descheiată larg la piept NU sunt uniformă; peste cămașă poate fi o vestă (pulover fără mâneci) sau un pulover subțire cu mâneci, negru ori închis la culoare, dacă se vede gulerul întors al cămășii — vesta nu strică uniforma, nici puloverul; bretelele (care țin pantalonii) peste cămașă sunt în regulă',
} as const;

export function validateConfig() {
  if (!config.botToken) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!config.supabaseUrl) throw new Error('SUPABASE_URL is required');
  if (!config.supabaseKey) throw new Error('SUPABASE_SERVICE_KEY is required');
  if (!config.anthropicApiKey) console.warn('ANTHROPIC_API_KEY not set — Z-report OCR disabled');
}
