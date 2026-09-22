import { describe, it, expect } from 'vitest';
import { FILLERS, IGNORE_TERMS, turnPatch } from './turn-canon';

// Secțiunea turn așa cum era pe agentul RO la 22.09, înainte de ION-32.
const LIVE_22_09 = {
  turn_timeout: 7,
  turn_eagerness: 'normal',
  speculative_turn: false,
  turn_model: 'turn_v3',
  interruption_ignore_terms: ['alo', 'алло', 'da', 'да', 'aha'],
  interruption_ignore_term_languages: [],
  merge_with_default_ignore_terms: false,
  transcribe_on_disabled_interruptions: true,
  soft_timeout_config: {
    timeout_seconds: -1,
    message: 'Hhmmmm...yeah.',
    additional_soft_timeout_messages: [],
    use_llm_generated_message: true,
    randomize_fillers: true,
    max_soft_timeouts_per_generation: 1,
    llm_generated_message_prompt_override: null,
    disable_until_first_user_message: false,
  },
};

describe('turnPatch', () => {
  it('agentul de la 22.09 primește eager, speculative și umpluturile fixe', () => {
    const { patch, fields } = turnPatch(LIVE_22_09, 'ro');
    expect(fields).toEqual([
      'turn.turn_eagerness', 'turn.speculative_turn',
      'turn.interruption_ignore_terms', 'turn.soft_timeout_config',
    ]);
    expect(patch?.turn_eagerness).toBe('eager');
    expect(patch?.speculative_turn).toBe(true);
    expect(patch?.soft_timeout_config.use_llm_generated_message).toBe(false);
    expect(patch?.soft_timeout_config.message).toBe('Mhm...');
    expect(patch?.soft_timeout_config.timeout_seconds).toBe(2.5);
  });

  it('turn_timeout nu se atinge: nu scurtează pauza, doar grăbește agentul peste client', () => {
    expect(turnPatch(LIVE_22_09, 'ro').patch?.turn_timeout).toBe(7);
  });

  it('câmpurile pe care le ține EL rămân ale lui', () => {
    const st = turnPatch(LIVE_22_09, 'ro').patch?.soft_timeout_config;
    expect(st.max_soft_timeouts_per_generation).toBe(1);
    expect(st).toHaveProperty('llm_generated_message_prompt_override', null);
  });

  it('agentul deja pe canon nu mai primește nimic — ca max_soft_timeouts urcat de EL să nu dea drift veșnic', () => {
    const { patch } = turnPatch(LIVE_22_09, 'ru');
    const { patch: again, fields } = turnPatch({ ...patch, soft_timeout_config: { ...patch?.soft_timeout_config, max_soft_timeouts_per_generation: 6 } }, 'ru');
    expect(again).toBeNull();
    expect(fields).toEqual([]);
  });

  it('agentul RU primește umpluturile rusești', () => {
    expect(turnPatch(LIVE_22_09, 'ru').patch?.soft_timeout_config.message).toBe(FILLERS.ru.first);
  });

  it('turn lipsă de tot se construiește întreg', () => {
    expect(turnPatch(undefined, 'ro').patch?.interruption_ignore_terms).toEqual(IGNORE_TERMS);
  });

  it('umpluturile nu promit nimic', () => {
    const toate = [...Object.values(FILLERS)].flatMap((f) => [f.first, ...f.more]).join(' ').toLowerCase();
    for (const promisiune of ['moment', 'secund', 'секунд', 'минут', 'așteptați', 'подождите']) {
      expect(toate).not.toContain(promisiune);
    }
  });

  it('lista care nu întrerupe n-are cuvinte cu conținut: nu, stop, altceva', () => {
    for (const w of ['nu', 'нет', 'stop', 'стоп', 'ok', 'bine', 'хорошо']) expect(IGNORE_TERMS).not.toContain(w);
  });
});
