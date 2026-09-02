// Test EL pentru «ziua în loc de localitate» (Ion, 02.09). Apel real
// conv_8401m1ggzbwtff0vb17mh2hcged1: la «De unde plecați și unde mergeți?»
// clientul a răspuns «merg de Duminica rutiera» — ziua plus felul transportului.
// Agentul a cerut «repetați numele localității», omul a închis.
// Sid separat, ca la celelalte: scripturile de seed sunt one-shot, re-rularea
// DUBLEAZĂ testele în ElevenLabs.
// Rulare:
//   ELEVENLABS_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//     node scripts/voice-agent/seed-day-locality-test.mjs [--dry]
// ATENȚIE (02.09): cheia ElevenLabs din Vercel întoarce 401 când e folosită de pe
// mașina de dezvoltare — EL pare să filtreze pe IP. Dacă apare 401, testul se
// încarcă prin MCP-ul claude.ai ElevenLabs, nu de aici; --dry rămâne util local.
// Înainte de încărcare verifică rotația examenelor: capacul din voice-exams.ts
// a fost ridicat la 30 pe 02.09, după ce măsurătoarea a arătat că EL paralelizează
// (18 teste = 25 s la buget 60 s). Cu 18 active + 19 lecții în coadă, plafonul se
// atinge din nou în ~2 săptămâni — atunci se retrag teste verzi vechi, nu se ridică
// iar plafonul. Un test în plus NU e gratis: verifică numărul înainte.
const KEY = process.env.ELEVENLABS_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry');
if (!KEY || (!DRY && (!SB_URL || !SB_KEY))) {
  console.error('Нужны env: ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY (кроме --dry)');
  process.exit(1);
}
const EL = 'https://api.elevenlabs.io';

async function el(method, path, body) {
  const r = await fetch(`${EL}${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function sb(path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`supabase ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}

const u = (msg) => ({ role: 'user', time_in_call_secs: 0, message: msg });
const a = (msg) => ({ role: 'agent', time_in_call_secs: 1, message: msg });

// Replicile sunt copiate din apelul real, inclusiv «Ano» — transcrierea unui
// «Da» prost auzit. Testul trebuie să sune ca telefonul, nu ca o conversație curată.
const TESTS = [
  {
    name: 'TLX ziua in loc de localitate',
    body: {
      type: 'llm', name: 'TLX ziua in loc de localitate',
      chat_history: [
        u('Ăăă, da, informații despre cursă.'),
        a('Spuneți-mi de unde și până unde...'),
        u('Eee, merg de Duminica rutiera.'),
      ],
      success_condition: 'The caller answered the "where from / where to" question with a DAY (duminică = Sunday) and the kind of transport (rutieră), not with a locality name. The agent must NOT ask the caller to repeat the locality name and must NOT treat "Duminica" or "rutiera" as a locality. Correct behavior: acknowledge that the day is noted WITHOUT saying the name of the day out loud, and ask only for the missing part — the departure and destination localities. Return True only if the agent asks for the localities without asking the caller to repeat a locality name he never said.',
      failure_examples: [
        { type: 'failure', response: 'Nu am prins bine. Puteți repeta numele localității?' },
        { type: 'failure', response: 'Nu găsesc localitatea Duminica. Puteți repeta?' },
      ],
      success_examples: [
        { type: 'success', response: 'Am notat ziua. Și de unde plecați și unde mergeți?' },
        { type: 'success', response: 'Bine, am notat. Din ce localitate plecați și până unde?' },
      ],
    },
  },
];

// Strajă de idempotență: EL întoarce un test_id NOU la fiecare create, deci
// `resolution=ignore-duplicates` (pe cheia test_id) nu prinde niciodată o
// re-rulare. Verificăm după NUME, altfel a doua rulare adaugă pe veci încă un
// test activ într-o rotație care are deja capacul atins (perf 02.09).
async function existaDeja(name) {
  const r = await fetch(`${SB_URL}/rest/v1/voice_agent_tests?name=eq.${encodeURIComponent(name)}&select=test_id`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`supabase select: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).length > 0;
}

for (const t of TESTS) {
  if (DRY) { console.log('[dry]', t.name); continue; }
  if (await existaDeja(t.name)) { console.log('sărit (există deja):', t.name); continue; }
  const res = await el('POST', '/v1/convai/agent-testing/create', t.body);
  console.log('created:', t.name, '→', res.id);
  await sb('voice_agent_tests', { test_id: res.id, name: t.name, source: 'seed' });
}
console.log(DRY ? 'DRY DONE' : 'SEED DONE');
