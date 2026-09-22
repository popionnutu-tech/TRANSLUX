// Canonul secțiunii `turn` a agenților Cristina (RO și RU). Controlerul o citește
// din agentul viu, o compară cu ce e aici și trimite un singur PATCH cu ce a deviat.
//
// ION-32 (22.09): Ion a ascultat agentul vocal al unui restaurant și a cerut
// setările lor. Măsurat pe 40 de apeluri RO înainte de schimbare: liniștea până
// răspunde agentul p50 2,27 s / p90 4,97 s (la ei p50 0,48 s), 23,6 % replici
// întrerupte. De la ei vin:
//  - turn_eagerness «eager» + speculative_turn: agentul preia rândul mai repede.
//    turn_timeout NU scurtează pauza — e cât așteaptă un client tăcut înainte să
//    vorbească din nou; coborât, agentul intră peste omul care dictează.
//  - umpluturile: interjecții FIXE, nu generate de model, în ordine aleatorie,
//    după 2,5 s de liniște. Fără «un moment»/«секунду» — clientul aude în ele o
//    promisiune; la ei, formulele politicoase au sunat mai rău decât «Mhm...».
//    ElevenLabs pune singur max_soft_timeouts_per_generation = 1 + câte fraze
//    suplimentare sunt, deci câmpul ăsta nu se compară.
//
// «da»/«да» RĂMÂN în lista care nu întrerupe, deși restaurantul le scoate: la ei
// un «da» aruncat lăsa agentul mut până la turn_timeout. La noi, pe 200 de apeluri
// RO (22.09), agentul n-a rămas niciodată fără răspuns după propria replică, iar
// lista e decizia lui Ion din 31.08 («alo alo» peste salut).

export type VoiceLang = 'ro' | 'ru';

// DOAR cuvinte fără conținut propriu: orice cuvânt adăugat aici = risc să ignorăm
// un răspuns real rostit peste coada întrebării. EL compară replica ÎNTREAGĂ, fără
// majuscule, nu prefixul — de aceea formele dublate stau pe rânduri separate.
export const IGNORE_TERMS = [
  'alo', 'алло', 'da', 'да', 'aha',
  'alo alo', 'алло алло', 'allo', 'алё', 'halo',
  'mhm', 'hmm', 'ahă', 'îhî', 'ага', 'угу', 'мгм', 'хм',
];

export const FILLERS: Record<VoiceLang, { first: string; more: string[] }> = {
  ro: { first: 'Mhm...', more: ['Să vedem...', 'Păi...', 'Așa...', 'Hmm...', 'Deci...'] },
  ru: { first: 'Так...', more: ['Ммм...', 'Посмотрим...', 'Угу...', 'Хм...', 'Итак...'] },
};

export const FILLER_AFTER_SECONDS = 2.5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Turn = Record<string, any>;

function softTimeout(lang: VoiceLang) {
  return {
    timeout_seconds: FILLER_AFTER_SECONDS,
    use_llm_generated_message: false,
    randomize_fillers: true,
    disable_until_first_user_message: true,
    message: FILLERS[lang].first,
    additional_soft_timeout_messages: [...FILLERS[lang].more],
  };
}

/**
 * Ce trebuie trimis ca `conversation_config.turn` ca agentul să ajungă la canon.
 * `patch` e null când nimic n-a deviat; `fields` numește fiecare câmp deviat,
 * ca jurnalul să spună exact ce s-a vindecat.
 */
export function turnPatch(turn: Turn | null | undefined, lang: VoiceLang): { patch: Turn | null; fields: string[] } {
  const t = turn ?? {};
  const st = t.soft_timeout_config ?? {};
  const want = softTimeout(lang);
  const fields = [
    t.turn_eagerness !== 'eager' && 'turn.turn_eagerness',
    t.speculative_turn !== true && 'turn.speculative_turn',
    t.turn_model !== 'turn_v3' && 'turn.turn_model',
    (t.interruption_ignore_terms ?? []).join('|') !== IGNORE_TERMS.join('|') && 'turn.interruption_ignore_terms',
    t.transcribe_on_disabled_interruptions !== true && 'turn.transcribe_on_disabled_interruptions',
    t.merge_with_default_ignore_terms !== false && 'turn.merge_with_default_ignore_terms',
    (t.interruption_ignore_term_languages ?? []).length !== 0 && 'turn.interruption_ignore_term_languages',
    (st.timeout_seconds !== want.timeout_seconds
      || st.use_llm_generated_message !== false
      || st.randomize_fillers !== true
      || st.disable_until_first_user_message !== true
      || st.message !== want.message
      || (st.additional_soft_timeout_messages ?? []).join('|') !== want.additional_soft_timeout_messages.join('|'))
      && 'turn.soft_timeout_config',
  ].filter((f): f is string => typeof f === 'string');
  if (!fields.length) return { patch: null, fields };
  return {
    patch: {
      ...t,
      turn_eagerness: 'eager',
      speculative_turn: true,
      turn_model: 'turn_v3',
      interruption_ignore_terms: [...IGNORE_TERMS],
      interruption_ignore_term_languages: [],
      merge_with_default_ignore_terms: false,
      transcribe_on_disabled_interruptions: true,
      // Spread peste cel viu: câmpurile pe care nu le ținem (max_soft_timeouts,
      // llm_generated_message_prompt_override) rămân cum le-a pus EL.
      soft_timeout_config: { ...st, ...want },
    },
    fields,
  };
}
