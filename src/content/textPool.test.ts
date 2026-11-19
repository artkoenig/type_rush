import { describe, it, expect } from "vitest";
import { calibrateText, pickRandom, TEXTS, RANGES, DURATIONS } from "./textPool";

/** Deterministische seeded RNG (mulberry32), liefert Zahlen in [0, 1). */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** QWERTZ-Standardzeichen: Buchstaben (inkl. Umlaute), Ziffern, Leerzeichen, übliche Satzzeichen. */
const QWERTZ_SAFE = /[\p{L}\p{N}\s.,!?;:'"()-]/u;

function isQwertzSafe(text: string): boolean {
  return [...text].every((ch) => QWERTZ_SAFE.test(ch));
}

describe("textPool: Pool-Inhalt", () => {
  it("enthält mindestens 20 Einträge", () => {
    expect(TEXTS.length).toBeGreaterThanOrEqual(20);
  });

  it("spannt alle drei Dauer-Buckets ab (mindestens ein Text pro Bucket)", () => {
    for (const duration of DURATIONS) {
      const [min, max] = RANGES[duration];
      const inBucket = TEXTS.filter((t) => t.length >= min && t.length <= max);
      expect(inBucket.length, `Bucket ${duration}s`).toBeGreaterThanOrEqual(1);
    }
  });

  it("verwendet nur QWERTZ-Standardzeichen (keine exotischen Tasten)", () => {
    for (const text of TEXTS) {
      expect(isQwertzSafe(text), `nicht QWERTZ-sicher: ${JSON.stringify(text)}`).toBe(true);
    }
  });
});

describe("calibrateText: Auswahl", () => {
  it("liefert für jede Dauer einen String", () => {
    for (const duration of DURATIONS) {
      expect(typeof calibrateText(duration, seededRng(1))).toBe("string");
    }
  });

  it("liefert für jede Dauer einen Text innerhalb des Ziel-Längenbereichs", () => {
    for (const duration of DURATIONS) {
      const [min, max] = RANGES[duration];
      // Über mehrere Seeds, um verschiedene Kandidaten zu treffen.
      for (let seed = 0; seed < 20; seed++) {
        const text = calibrateText(duration, seededRng(seed));
        expect(text.length, `Dauer ${duration}s, Seed ${seed}: "${text}"`).toBeGreaterThanOrEqual(
          min,
        );
        expect(text.length, `Dauer ${duration}s, Seed ${seed}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it("liefert immer einen Text aus dem Pool", () => {
    for (const duration of DURATIONS) {
      const text = calibrateText(duration, seededRng(42));
      expect(TEXTS).toContain(text);
    }
  });

  it("ist deterministisch: gleiche seeded RNG → gleiche Auswahl", () => {
    for (const duration of DURATIONS) {
      const first = calibrateText(duration, seededRng(1234));
      const second = calibrateText(duration, seededRng(1234));
      expect(second).toBe(first);
    }
  });

  it("respektiert die RNG: verschiedene Seeds können verschiedene Texte liefern", () => {
    const distinct = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      distinct.add(calibrateText(60, seededRng(seed)));
    }
    expect(distinct.size).toBeGreaterThan(1);
  });
});

describe("pickRandom: Zufallsauswahl", () => {
  it("liefert bei seeded RNG ein Element aus der Liste", () => {
    const items = ["a", "b", "c", "d", "e"];
    for (let seed = 0; seed < 20; seed++) {
      expect(items).toContain(pickRandom(items, seededRng(seed)));
    }
  });

  it("ist deterministisch: gleiche seeded RNG → gleiches Element", () => {
    const items = ["a", "b", "c", "d", "e"];
    expect(pickRandom(items, seededRng(7))).toBe(pickRandom(items, seededRng(7)));
  });

  it("wirft bei leerer Liste", () => {
    expect(() => pickRandom([])).toThrow(/leere Kandidatenliste/);
  });
});
