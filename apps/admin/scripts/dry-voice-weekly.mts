// Probă pe viu, FĂRĂ Telegram: construiește raportul săptămânal și îl tipărește.
//   cd apps/admin && node --env-file=.env --env-file=.env.production.local --import tsx scripts/dry-voice-weekly.mts
// (cheia ANTHROPIC_API_KEY stă doar în .env.production.local)
const pick = async (p: string) => { const m: any = await import(p); return m.default ?? m; };

const { getSupabase } = await pick('../src/lib/supabase');
const W: any = await pick('../src/lib/voice-weekly');
const T: any = await pick('../src/lib/chisinau-time');

const zi = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

const { start, sfarsit } = W.saptamanaIncheiata(T.chisinauTodayIso());
const supabase = getSupabase();
const { data, error } = await supabase.rpc('voice_apeluri_rezultat', {
  p_from: T.chisinauDayStartIso(start),
  p_to: T.chisinauDayStartIso(zi(sfarsit, 1)),
});
if (error) throw new Error(error.message);
const apeluri = data ?? [];
console.log(`săptămâna ${start}..${sfarsit}: ${apeluri.length} apeluri`);

const verdicte = await W.clasificaFaraTool(apeluri, Date.now() + 90_000);
console.log(`clasificate de model: ${verdicte.size}`);

const { data: lectiiRaw } = await supabase.from('voice_lessons')
  .select('payload, status')
  .eq('kind', 'prompt_lesson').eq('payload->>source', 'judge')
  .neq('status', 'rejected')
  .gte('created_at', T.chisinauDayStartIso(start))
  .lt('created_at', T.chisinauDayStartIso(zi(sfarsit, 1)));
const lectii = (lectiiRaw ?? []).map((l: any) => ({ rule: l.payload?.rule ?? '?' }));

console.log('\n─────── mesajul ───────\n');
console.log(W.compuneRaport({ perioada: W.etichetaPerioadei(start, sfarsit), apeluri, verdicte, lectii }));
