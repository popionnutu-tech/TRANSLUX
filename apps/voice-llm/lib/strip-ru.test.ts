// Reproducerea apelului conv_3101m18kxmbce2br16snwy8detmc (30.08): clientul vorbea
// română, ASR i-a scris «Да.» cu chirilice, iar modelul a citit driver_line_ru din
// search_trips. Filtrul taie câmpurile _ru din rezultatele tool DOAR cu dovadă dublă:
// nicio fază rusească stabilită ȘI ultima replică user determinabilă e românească —
// auditul pe 233 transcripturi a arătat că poarta doar pe replica agentului tăia
// _ru la 10 apelanți ruși reali pentru 1 caz de bug.
import { describe, expect, it } from "vitest";
import { pendingLanguageTransfer } from "./language";
import { stripRuToolFields, voiceLanguage, type OpenAIMessage } from "./openai-compat";

const searchTripsResult = JSON.stringify({
  count: 1,
  date_label_ro: "azi, treizeci august",
  date_label_ru: "сегодня, тридцатого августа",
  driver_line_ro: "Șoferul cursei de treisprezece și cincizeci și cinci este Serghei.",
  driver_line_ru: "Водитель рейса тринадцать пятьдесят пять — Сергей.",
  trips: [{
    departure: "13:55",
    departure_spoken_ro: "treisprezece și cincizeci și cinci",
    departure_spoken_ru: "тринадцать пятьдесят пять",
    phone_spoken_ro: "zero șase nouă",
    phone_spoken_ru: "ноль шесть девять",
  }],
});

// Turele apelului real: client român cu replici concludente, apoi «Да.» chirilizat.
const roCallWithDa = (toolContent: string): OpenAIMessage[] => [
  { role: "user", content: "Mmm, da, mai târziu, următoarea, la ce oră pornește?" },
  { role: "assistant", content: "Următoarea pleacă la treisprezece și cincizeci și cinci. Doriți numărul șoferului?" },
  { role: "user", content: "Да." },
  { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "search_trips", arguments: '{"from":"Chișinău","to":"Corjeuți","departure":"13:55"}' } }] },
  { role: "tool", tool_call_id: "t1", content: toolContent },
];

describe("voiceLanguage", () => {
  it("«Да.» chirilizat nu schimbă limba: ultima replică assistant e românească", () => {
    expect(voiceLanguage(roCallWithDa(searchTripsResult))).toBe("ro");
  });

  it("ultimul language_detection decide, peste orice text", () => {
    const messages: OpenAIMessage[] = [
      { role: "assistant", content: "Cu ce vă pot ajuta?" },
      { role: "assistant", content: null, tool_calls: [{ id: "t2", type: "function", function: { name: "language_detection", arguments: '{"language":"ru"}' } }] },
    ];
    expect(voiceLanguage(messages)).toBe("ru");
  });

  it("o predare transfer_to_agent în istoric = rusă (singura direcție e RO→RU)", () => {
    const messages: OpenAIMessage[] = [
      { role: "assistant", content: "Cu ce vă pot ajuta?" },
      { role: "assistant", content: null, tool_calls: [{ id: "t2", type: "function", function: { name: "transfer_to_agent", arguments: '{"agent_number":0}' } }] },
    ];
    expect(voiceLanguage(messages)).toBe("ru");
  });
});

// Gardul celui de-al doilea consumator al lui RU_MARKERS (review 30.08): o eroare în
// stripRuToolFields doar nu taie; o eroare aici predă românul agentului rus. Orice
// lărgire a dicționarului trebuie să treacă și pe aceste două teste.
describe("pendingLanguageTransfer", () => {
  it("O SINGURĂ cerere «Давайте по-русски» după dialog românesc: null — predă modelul, nu scurtătura", () => {
    const messages: OpenAIMessage[] = [
      { role: "user", content: "Bună ziua, la ce oră pleacă cursa spre Bălți?" },
      { role: "assistant", content: "Următoarea cursă pleacă la treisprezece și cincizeci și cinci." },
      { role: "user", content: "Давайте по-русски." },
    ];
    expect(pendingLanguageTransfer(messages)).toBeNull();
  });

  it("două replici rusești concludente la rând într-un dialog românesc: 'ru'", () => {
    const messages: OpenAIMessage[] = [
      { role: "assistant", content: "Următoarea cursă pleacă la treisprezece și cincizeci și cinci." },
      { role: "user", content: "Давайте по-русски." },
      { role: "assistant", content: "Continuăm în română. Cu ce vă mai pot ajuta?" },
      { role: "user", content: "Скажите пожалуйста, сколько стоит билет?" },
    ];
    expect(pendingLanguageTransfer(messages)).toBe("ru");
  });
});

describe("stripRuToolFields", () => {
  it("client dovedit român + «Да.» ambiguu: taie recursiv toate câmpurile _ru", () => {
    const out = stripRuToolFields(roCallWithDa(searchTripsResult));
    const tool = out.find((m) => m.role === "tool");
    const parsed = JSON.parse(tool?.content as string);
    expect(parsed.driver_line_ru).toBeUndefined();
    expect(parsed.date_label_ru).toBeUndefined();
    expect(parsed.trips[0].departure_spoken_ru).toBeUndefined();
    expect(parsed.trips[0].phone_spoken_ru).toBeUndefined();
    expect(parsed.driver_line_ro).toContain("Serghei");
    expect(parsed.trips[0].phone_spoken_ro).toBe("zero șase nouă");
  });

  it("apelant rus de la primele cuvinte (salutul agentului e ro): nu taie nimic", () => {
    // Cazul fals-pozitiv din audit: tura de comutare e mută, «ultima replică
    // assistant» rămâne românească exact când clientul rus primește răspunsul.
    const messages: OpenAIMessage[] = [
      { role: "assistant", content: "Bună ziua! Ați sunat la TRANSLUX. Cu ce vă pot ajuta?" },
      { role: "user", content: "Вот сколько сегодня последняя маршрутка из Кишинёва в Бельцы?" },
      { role: "tool", tool_call_id: "t3", content: searchTripsResult },
    ];
    const tool = stripRuToolFields(messages).find((m) => m.role === "tool");
    expect(JSON.parse(tool?.content as string).driver_line_ru).toContain("Сергей");
  });

  it("cererea comutării «Давайте по-русски» după dialog românesc: nu taie nimic", () => {
    // Gaura din review-ul rundei 2: fraza cererii nu avea cuvinte de serviciu în
    // RU_MARKERS → null → mersul înapoi găsea replicile românești și tăia _ru
    // exact rusului care tocmai a cerut rusa. Prima tură de după predare.
    const messages: OpenAIMessage[] = [
      { role: "user", content: "Mmm, da, mai târziu, următoarea, la ce oră pornește?" },
      { role: "assistant", content: "Următoarea pleacă la treisprezece și cincizeci și cinci." },
      { role: "user", content: "Давайте по-русски." },
      { role: "tool", tool_call_id: "t4", content: searchTripsResult },
    ];
    const tool = stripRuToolFields(messages).find((m) => m.role === "tool");
    expect(JSON.parse(tool?.content as string).driver_line_ru).toContain("Сергей");
  });

  it("după language_detection(ru) câmpurile _ru rămân", () => {
    const messages: OpenAIMessage[] = [
      { role: "assistant", content: null, tool_calls: [{ id: "t2", type: "function", function: { name: "language_detection", arguments: '{"language":"ru"}' } }] },
      ...roCallWithDa(searchTripsResult),
    ];
    const tool = stripRuToolFields(messages).find((m) => m.role === "tool");
    expect(JSON.parse(tool?.content as string).driver_line_ru).toContain("Сергей");
  });

  it("dialog rusesc stabilit (replica assistant în rusă): nu taie nimic", () => {
    const messages: OpenAIMessage[] = [
      { role: "user", content: "Да, а сколько сейчас времени, скажите?" },
      { role: "assistant", content: "Сейчас девять часов. Что-нибудь ещё?" },
      { role: "tool", tool_call_id: "t3", content: searchTripsResult },
    ];
    const tool = stripRuToolFields(messages).find((m) => m.role === "tool");
    expect(JSON.parse(tool?.content as string).driver_line_ru).toContain("Сергей");
  });

  it("nicio replică user concludentă: nu taie nimic (partea sigură)", () => {
    const messages: OpenAIMessage[] = [
      { role: "assistant", content: "Bună ziua! Ați sunat la TRANSLUX. Cu ce vă pot ajuta?" },
      { role: "user", content: "Алло." },
      { role: "tool", tool_call_id: "t3", content: searchTripsResult },
    ];
    const tool = stripRuToolFields(messages).find((m) => m.role === "tool");
    expect(JSON.parse(tool?.content as string).driver_line_ru).toContain("Сергей");
  });

  it("cheile goale {ro, ru} din did_you_mean supraviețuiesc (doar sufixul _ru se taie)", () => {
    const content = JSON.stringify({
      count: 0,
      unknown_locality: "Curjăuți",
      did_you_mean: [{ ro: "Corjeuți", ru: "Коржеуць" }],
      date_label_ru: "сегодня",
    });
    const tool = stripRuToolFields(roCallWithDa(content)).find((m) => m.role === "tool");
    const parsed = JSON.parse(tool?.content as string);
    expect(parsed.did_you_mean[0].ru).toBe("Коржеуць");
    expect(parsed.date_label_ru).toBeUndefined();
  });

  it("conținut tool care nu e JSON rămâne neatins, chiar dacă pomenește _ru", () => {
    const messages = roCallWithDa("eroare: câmpul driver_line_ru lipsește");
    const tool = stripRuToolFields(messages).find((m) => m.role === "tool");
    expect(tool?.content).toBe("eroare: câmpul driver_line_ru lipsește");
  });

  it("mesajele care nu sunt tool nu se ating (referință identică)", () => {
    const messages = roCallWithDa(searchTripsResult);
    const out = stripRuToolFields(messages);
    expect(out[0]).toBe(messages[0]);
    expect(out[1]).toBe(messages[1]);
    expect(out[2]).toBe(messages[2]);
  });
});
