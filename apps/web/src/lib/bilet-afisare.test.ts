import { describe, expect, it } from "vitest";
import { durataDrum, placaAfisata } from "./bilet-afisare";

describe("placaAfisata", () => {
  it("literele întâi, ca pe plăcuță", () => {
    expect(placaAfisata("652AKD")).toBe("AKD 652");
    expect(placaAfisata("akd 652")).toBe("AKD 652");
    expect(placaAfisata("RM 0001")).toBe("RM 0001");
    expect(placaAfisata("")).toBeNull();
    expect(placaAfisata("X1")).toBe("X1");
  });
});

describe("durataDrum", () => {
  it("ore și minute, peste miezul nopții", () => {
    expect(durataDrum("06:55", "10:15")).toBe("3 h 20");
    expect(durataDrum("09:40", "12:40")).toBe("3 h");
    expect(durataDrum("22:30", "01:05")).toBe("2 h 35");
    expect(durataDrum("10:00", "10:45")).toBe("45 min");
    expect(durataDrum("10:00", "")).toBeNull();
  });
});
