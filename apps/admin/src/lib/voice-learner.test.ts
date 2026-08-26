import { describe, it, expect } from 'vitest';
import { prioritizeDialogs, type LearnerDialog } from './voice-learner';
import { key } from './voice-locality';

const d = (id: string, dialog: string, hasCyr: boolean): LearnerDialog => ({ id, dialog, hasCyr });

describe('prioritizeDialogs', () => {
  it('диалог с нераспознанной формой идёт раньше более свежих кириллических', () => {
    const dialogs = [
      d('fresh', 'CLIENT: хочу в Бельцы завтра утром', true),
      d('miss', 'CLIENT: мне надо в Скоржоуць\nAGENT: не понял', true),
    ];
    const out = prioritizeDialogs(dialogs, new Set([key('Скоржоуць')]), 15);
    expect(out.map((x) => x.id)).toEqual(['miss', 'fresh']);
  });

  it('латинский приоритетный диалог проходит без кириллицы, обычный латинский — нет', () => {
    const dialogs = [
      d('lat-miss', 'CLIENT: vreau la Brăcești mâine\nAGENT: nu am înțeles', false),
      d('lat-plain', 'CLIENT: vreau la Bălți mâine dimineață', false),
    ];
    const out = prioritizeDialogs(dialogs, new Set([key('Brăcești')]), 15);
    expect(out.map((x) => x.id)).toEqual(['lat-miss']);
  });

  it('форма, разорванная ASR на два слова, ловится окном', () => {
    const dialogs = [d('split', 'CLIENT: мне в кор жоуце надо\nAGENT: повторите', true)];
    const out = prioritizeDialogs(dialogs, new Set([key('коржоуце')]), 15);
    expect(out.map((x) => x.id)).toEqual(['split']);
  });

  it('режет по max, приоритетные не вытесняются', () => {
    const dialogs = [
      d('c1', 'CLIENT: в Бельцы пожалуйста', true),
      d('c2', 'CLIENT: в Единцы пожалуйста', true),
      d('miss', 'CLIENT: мне в Тыртаул\nAGENT: не понял', true),
    ];
    const out = prioritizeDialogs(dialogs, new Set([key('Тыртаул')]), 2);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('miss');
  });

  it('без провалов — прежнее поведение: кириллические по порядку', () => {
    const dialogs = [
      d('a', 'CLIENT: в Бричаны', true),
      d('b', 'CLIENT: doar română aici', false),
    ];
    const out = prioritizeDialogs(dialogs, new Set(), 15);
    expect(out.map((x) => x.id)).toEqual(['a']);
  });
});
