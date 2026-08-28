import { describe, it, expect } from 'vitest';
import {
  parseInvokeToolCall,
  TtsGate,
  violatesLanguagePolicy,
} from './openai-compat';

// Реальная утечка из conv_4001m13yffkxesq9a86xcn0g4awz (28.08): Haiku написал
// tool-вызов текстом, и румынский голос прочитал XML вслух.
const LEAKED = `<invoke name="language_detection">
<parameter name="reason">Клиент говорит по-русски: две полные фразы с глаголами («мне надо поехать», «слушай»). Переключаю язык беседы на русский.</parameter>
<parameter name="language">ru</parameter>
</invoke>`;

const TOOLS = new Set(['search_trips', 'get_price', 'request_callback', 'language_detection', 'end_call']);

/** Гонит текст через гейт кусками по n символов — как дельты реального стрима. */
function runStream(text: string, n = 4, tools = TOOLS) {
  const gate = new TtsGate(tools);
  let speech = '';
  const toolCalls: Array<{ name: string; args: Record<string, string> }> = [];
  for (let i = 0; i < text.length; i += n) {
    const out = gate.push(text.slice(i, i + n));
    speech += out.speech;
    if (out.toolCall) toolCalls.push(out.toolCall);
  }
  const fin = gate.finish();
  speech += fin.speech;
  if (fin.toolCall) toolCalls.push(fin.toolCall);
  return { gate, speech, toolCalls };
}

describe('parseInvokeToolCall', () => {
  it('парсит реальную утечку в имя и параметры', () => {
    const out = parseInvokeToolCall(LEAKED);
    expect(out?.name).toBe('language_detection');
    expect(out?.args.language).toBe('ru');
    expect(out?.args.reason).toContain('по-русски');
  });

  it('обрыв без </invoke> — имя есть, оборванный параметр отброшен', () => {
    const out = parseInvokeToolCall('<invoke name="language_detection">\n<parameter name="language">ru</parameter>\n<parameter name="reason">обрыв');
    expect(out?.name).toBe('language_detection');
    expect(out?.args.language).toBe('ru');
    expect(out?.args.reason).toBeUndefined();
  });

  it('находит <invoke> и внутри обёртки <function_calls>', () => {
    const out = parseInvokeToolCall('<function_calls>\n<invoke name="end_call">\n</invoke>');
    expect(out?.name).toBe('end_call');
  });

  it('не-XML → null', () => {
    expect(parseInvokeToolCall('Нашла три рейса из Бельц.')).toBeNull();
    expect(parseInvokeToolCall('')).toBeNull();
  });
});

describe('violatesLanguagePolicy (на полном тексте)', () => {
  it('румынский, русский и их смесь проходят', () => {
    expect(violatesLanguagePolicy('Am găsit trei curse de la Bălți la Chișinău.')).toBe(false);
    expect(violatesLanguagePolicy('Нашла три рейса, ближайший в семь двадцать.')).toBe(false);
    expect(violatesLanguagePolicy('Водитель — Ion, номер продиктую медленно.')).toBe(false);
    expect(violatesLanguagePolicy('Cursa are plecare la șapte și zece.')).toBe(false); // «are» — румынский
  });

  it('английский и чужие алфавиты ловятся', () => {
    expect(violatesLanguagePolicy('I will check the schedule for you, please wait.')).toBe(true);
    expect(violatesLanguagePolicy('Sizə kömək edə bilərəm')).toBe(true); // азербайджанский
    expect(violatesLanguagePolicy('Καλημέρα σας')).toBe(true); // греческий
    expect(violatesLanguagePolicy('café-ul e deschis')).toBe(false); // 1 акцент — не нарушение
  });

  it('английский из содержательных слов без стоп-слов ловится (аудит 28.08, C1)', () => {
    expect(violatesLanguagePolicy('Sure, there are three buses tomorrow morning.')).toBe(true);
    expect(violatesLanguagePolicy('Next departure leaves at seven fifteen sharp.')).toBe(true);
  });

  it('Ion 28.08: «никаких английских вообще» — 2 слова из словаря достаточно', () => {
    expect(violatesLanguagePolicy('Bus station near you.')).toBe(true);
    // Ровно 2 маркера и 2 слова: различает порог 2 от 3 (мутационная ловушка H2)
    expect(violatesLanguagePolicy('Good day.')).toBe(true);
  });

  it('романские языки ловятся своим словарём (ревью 28.08, H1)', () => {
    expect(violatesLanguagePolicy('Mi scusi, non ho capito bene, puo ripetere?')).toBe(true); // итальянский
    expect(violatesLanguagePolicy('Lo siento, no te entiendo. Puede repetir por favor?')).toBe(true); // испанский
    expect(violatesLanguagePolicy('Je ne comprends pas ce que vous dites, repetez lentement.')).toBe(true); // французский
    expect(violatesLanguagePolicy('Se puder repetir mais devagar, agradeco muito.')).toBe(true); // португальский
  });

  it('батч-ложные из ревью M2 больше не режутся (порог доминирования един = 12)', () => {
    expect(violatesLanguagePolicy('Pasagerul José Müller are loc rezervat.')).toBe(false);
    expect(violatesLanguagePolicy('Sigur, verific imediat orarul complet.')).toBe(false);
  });

  it('польская утечка из истории ловится (правило чужого алфавита: ż/ó/ę)', () => {
    expect(violatesLanguagePolicy('Przepraszam, nie rozumiem. Czy możesz powtórzyć, proszę?')).toBe(true);
  });

  it('короткий румынский без диакритики из истории НЕ ловится', () => {
    expect(violatesLanguagePolicy('N-am prins localitatea. Cum se...')).toBe(false);
    expect(violatesLanguagePolicy('Te ascult, spune-mi ce ai nevoie.')).toBe(false);
  });

  it('русская фраза с латинскими именами НЕ ловится (кириллица доминирует)', () => {
    expect(violatesLanguagePolicy('Водитель Ion Popescu, машина Mercedes Sprinter, номер продиктую.')).toBe(false);
  });
});

describe('TtsGate — стрим дельтами (главная поверхность)', () => {
  it('XML-утечка целиком превращается в tool-вызов, в TTS не уходит ни символа', () => {
    const { speech, toolCalls } = runStream(LEAKED, 3);
    expect(speech).toBe('');
    expect(toolCalls).toEqual([{ name: 'language_detection', args: { language: 'ru', reason: expect.stringContaining('по-русски') } }]);
  });

  it('XML с неизвестным (галлюцинированным) тулом глушится без вызова', () => {
    const { gate, speech, toolCalls } = runStream('<invoke name="transfer_money">\n<parameter name="to">x</parameter>\n</invoke>', 5);
    expect(speech).toBe('');
    expect(toolCalls).toEqual([]);
    expect(gate.suppressed).toBe(true);
  });

  it('разметка не-invoke (<function_calls> без invoke, <tool_use>) глушится', () => {
    for (const junk of ['<function_calls>\n</function_calls>', '<tool_use>ceva</tool_use>']) {
      const { gate, speech } = runStream(junk, 4);
      expect(speech).toBe('');
      expect(gate.suppressed).toBe(true);
    }
  });

  it('английская реплика обрезается по накопленному тексту (ловушка ревью 28.08)', () => {
    const phrase = 'The bus leaves at seven, you can pay the driver directly at the station.';
    const { gate, speech } = runStream(phrase, 3);
    expect(speech.length).toBeLessThan(phrase.length / 4); // порог 2: режется на втором слове
    expect(gate.suppressed).toBe(true);
  });

  it('короткий содержательный английский режется в стриме почти сразу (Ion 28.08)', () => {
    const phrase = 'Sure, there are three buses tomorrow morning.';
    const { gate, speech } = runStream(phrase, 3);
    expect(speech.length).toBeLessThan(phrase.length / 2);
    expect(gate.suppressed).toBe(true);
  });

  it('«<» посреди реплики: до него озвучено, tool-вызов из хвоста СПАСЁН (аудит 28.08, H4)', () => {
    const { gate, speech, toolCalls } = runStream('Un moment. <invoke name="language_detection">\n<parameter name="language">ru</parameter>\n</invoke>', 4);
    expect(speech).toBe('Un moment. ');
    expect(gate.suppressed).toBe(true);
    expect(toolCalls).toEqual([{ name: 'language_detection', args: { language: 'ru' } }]);
  });

  it('«<» посреди реплики без валидного вызова в хвосте — просто заглушено', () => {
    const { gate, speech, toolCalls } = runStream('Îndată vă spun. <tool_use>gunoi</tool_use>', 4);
    expect(speech).toBe('Îndată vă spun. ');
    expect(toolCalls).toEqual([]);
    expect(gate.suppressed).toBe(true);
  });

  it('прощание + end_call текстом: прощание озвучено, вызов спасён — линия закрывается (аудит TLX, High)', () => {
    const { speech, toolCalls } = runStream('Vă mulțumesc pentru apel! O zi bună! <invoke name="end_call"></invoke>', 4);
    expect(speech).toBe('Vă mulțumesc pentru apel! O zi bună! ');
    expect(toolCalls).toEqual([{ name: 'end_call', args: {} }]);
  });

  it('короткий зачин + бизнес-XML: зачин не считается полноценной репликой (spokenChars < 40 → извинение)', () => {
    const { gate, speech, toolCalls } = runStream('Sigur. <invoke name="request_callback">\n<parameter name="reason">x</parameter>\n</invoke>', 4);
    expect(speech).toBe('Sigur. ');
    expect(toolCalls).toEqual([]); // бизнес-тул из текста не спасается — верно
    expect(gate.suppressed).toBe(true);
    expect(gate.spokenChars).toBeLessThan(40);
  });

  it('нормальные румынская и русская реплики проходят дословно', () => {
    for (const phrase of [
      'Am găsit trei curse de la Bălți la Chișinău. Cea mai apropiată pleacă la șapte și zece.',
      'Нашла три рейса из Бельц в Кишинёв. Ближайший отправляется в семь двадцать.',
    ]) {
      const { gate, speech } = runStream(phrase, 3);
      expect(speech).toBe(phrase);
      expect(gate.suppressed).toBe(false);
    }
  });

  it('румынский БЕЗ диакритики не режется на растущем префиксе (security-ревью 28.08, H1)', () => {
    for (const phrase of [
      'Soferul va suna cand ajunge la statie, va rog asteptati.',
      'Bilet dus-intors costa trei sute cincizeci de lei.',
      'Am notat solicitarea dumneavoastra, colegii vor verifica situatia.',
    ]) {
      const { gate, speech } = runStream(phrase, 4);
      expect(speech).toBe(phrase);
      expect(gate.suppressed).toBe(false);
    }
  });

  it('пустой ход (чистый tool_use без текста) — не блокировка и не «подавление»', () => {
    const gate = new TtsGate(TOOLS);
    const out = gate.push('', true);
    expect(out).toEqual({ speech: '', toolCall: null });
    expect(gate.suppressed).toBe(false);
    expect(gate.spokeSomething).toBe(false);
  });

  it('нарратив-преамбула по-прежнему срезается (регресс flushLead)', () => {
    const { speech } = runStream('Хорошо, сейчас проверю. Нашла два рейса на завтра.', 4);
    expect(speech).toBe('Нашла два рейса на завтра.');
  });
});
