import { describe, expect, it } from "vitest";
import { lockedLanguage, wrongLockedLanguage } from "./language";
import { stripRuToolFields, TtsGate, type OpenAIMessage } from "./openai-compat";

// ION-40: linia cu meniu 1/2 — fiecare agent vorbește doar limba lui.
const GREET_RO = "Bună seara! Ați sunat la TRANSLUX. Convorbirea este înregistrată. Cu ce vă pot ajuta?";
const GREET_RU = "Добрый вечер! Вы позвонили в ТрансЛюкс. Разговор записывается. Чем могу помочь?";
const tools = (...names: string[]) => ({ tools: names.map((name) => ({ function: { name } })) });
const conv = (greet: string, user: string): OpenAIMessage[] => [
  { role: "system", content: "x" },
  { role: "assistant", content: greet },
  { role: "user", content: user },
];

describe("lockedLanguage", () => {
  it("RO agent fără tool-uri de limbă = blocat pe română", () => {
    expect(lockedLanguage(conv(GREET_RO, "Добрый день! Хочу забронировать место."), tools("search_trips", "end_call"))).toBe("ro");
  });
  it("RU agent = blocat pe rusă", () => {
    expect(lockedLanguage(conv(GREET_RU, "Bună ziua, vreau un bilet."), tools("search_trips"))).toBe("ru");
  });
  it("cu language_detection sau transfer_to_agent — configurația veche, fără blocare", () => {
    expect(lockedLanguage(conv(GREET_RO, "Алло"), tools("language_detection"))).toBeNull();
    expect(lockedLanguage(conv(GREET_RO, "Алло"), tools("transfer_to_agent"))).toBeNull();
  });
  it("fără salut concludent — fără blocare", () => {
    expect(lockedLanguage([{ role: "user", content: "Алло" }], tools())).toBeNull();
    expect(lockedLanguage(conv("Da.", "Алло"), tools())).toBeNull();
  });
});

describe("wrongLockedLanguage", () => {
  it("apelul lui Ion 23.09: RO blocat, răspuns rusesc = tăiat", () => {
    expect(wrongLockedLanguage("Я вас не совсем поняла — машину забронировать нельзя.", "ro")).toBe(true);
  });
  it("RO blocat: replică românească cu nume latine trece", () => {
    expect(wrongLockedLanguage("Cursa din Chișinău spre Briceni pleacă la ora opt.", "ro")).toBe(false);
  });
  it("RU blocat: replică românească = tăiată, rusă cu un nume latin trece", () => {
    expect(wrongLockedLanguage("Cursa din Chișinău spre Briceni pleacă la ora opt.", "ru")).toBe(true);
    expect(wrongLockedLanguage("Рейс из Кишинёва в Бричаны отправляется в восемь, Google.", "ru")).toBe(false);
  });
  it("fără blocare nu taie nimic", () => {
    expect(wrongLockedLanguage("Я вас не поняла", null)).toBe(false);
  });
});

describe("TtsGate cu limbă blocată", () => {
  it("RO: replica rusească nu ajunge la TTS și lockHit e setat", () => {
    const g = new TtsGate(new Set(), "ro");
    const a = g.push("Я вас не совсем поняла. ");
    const b = g.finish();
    expect(a.speech + b.speech).toBe("");
    expect(g.suppressed).toBe(true);
    expect(g.lockHit).toBe(true);
  });
  it("RO: replica românească trece neatinsă", () => {
    const g = new TtsGate(new Set(), "ro");
    const out = g.push("Sigur, cursa pleacă la opt. ").speech + g.finish().speech;
    expect(out).toContain("cursa pleacă la opt");
    expect(g.lockHit).toBe(false);
  });
  it("fără blocare (null) rusa trece ca înainte", () => {
    const g = new TtsGate(new Set(), null);
    const out = g.push("Рейс отправляется в восемь. ").speech + g.finish().speech;
    expect(out).toContain("Рейс");
  });
});

describe("stripRuToolFields pe linia RO blocată", () => {
  it("taie _ru chiar dacă clientul vorbește rusește", () => {
    const msgs: OpenAIMessage[] = [
      ...conv(GREET_RO, "Добрый день, сколько стоит билет до Бричан?"),
      { role: "tool", content: JSON.stringify({ price_ro: "121 lei", price_ru: "121 лей" }), tool_call_id: "t1" },
    ];
    const out = stripRuToolFields(msgs, "ro");
    expect(String(out[3].content)).not.toContain("_ru");
    // fără blocare, clientul rus își păstrează câmpurile
    expect(String(stripRuToolFields(msgs, null)[3].content)).toContain("price_ru");
  });
});
