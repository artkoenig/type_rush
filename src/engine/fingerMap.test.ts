import { describe, it, expect } from "vitest";
import { fingerFor, FINGERS, DEFAULT_FINGER } from "./fingerMap";

const homeRow = [
  ["a", "left", "pinky"],
  ["s", "left", "ring"],
  ["d", "left", "middle"],
  ["f", "left", "index"],
  ["g", "left", "index"],
  ["h", "right", "index"],
  ["j", "right", "index"],
  ["k", "right", "middle"],
  ["l", "right", "ring"],
  ["ö", "right", "ring"],
  ["ä", "right", "pinky"],
] as const;

describe("fingerFor", () => {
  it("ordnet Home-Row-Tasten den Standard-Fingern der Zehn-Finger-Methode zu", () => {
    for (const [key, side, digit] of homeRow) {
      expect(fingerFor(key)).toEqual({ side, digit });
    }
  });

  it("beachtet den QWERTZ-Tausch: z auf linkem Zeigefinger, y auf linkem Kleinfinger", () => {
    expect(fingerFor("z")).toEqual({ side: "left", digit: "index" });
    expect(fingerFor("y")).toEqual({ side: "left", digit: "pinky" });
  });

  it("ordnet die Zahlreihe zu", () => {
    expect(fingerFor("1")).toEqual({ side: "left", digit: "pinky" });
    expect(fingerFor("3")).toEqual({ side: "left", digit: "middle" });
    expect(fingerFor("5")).toEqual({ side: "left", digit: "index" });
    expect(fingerFor("6")).toEqual({ side: "right", digit: "index" });
    expect(fingerFor("8")).toEqual({ side: "right", digit: "middle" });
    expect(fingerFor("0")).toEqual({ side: "right", digit: "pinky" });
  });

  it("ordnet Umlaute ihren QWERTZ-Positionen zu", () => {
    expect(fingerFor("ü")).toEqual({ side: "right", digit: "pinky" });
    expect(fingerFor("ö")).toEqual({ side: "right", digit: "ring" });
    expect(fingerFor("ä")).toEqual({ side: "right", digit: "pinky" });
    expect(fingerFor("ß")).toEqual({ side: "right", digit: "pinky" });
  });

  it("ist unabhängig von Groß-/Kleinschreibung", () => {
    for (const key of ["a", "z", "q", "p", "ö", "ä", "ü"]) {
      expect(fingerFor(key.toUpperCase())).toEqual(fingerFor(key));
    }
  });

  it("ordnet die Leertaste dem Daumen zu", () => {
    expect(fingerFor(" ")).toEqual({ side: "right", digit: "thumb" });
  });

  it("liefert für unbekannte Tasten den Default-Finger (Daumen)", () => {
    expect(fingerFor("€")).toBe(DEFAULT_FINGER);
    expect(fingerFor("∞")).toBe(DEFAULT_FINGER);
    expect(fingerFor("F1")).toBe(DEFAULT_FINGER);
    expect(fingerFor("")).toBe(DEFAULT_FINGER);
  });

  it("deckt alle QWERTZ-Buchstaben, Ziffern und übliche Sonderzeichen ab", () => {
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");
    const digits = "0123456789".split("");
    const punctuation = [
      "`",
      "!",
      '"',
      "§",
      "$",
      "%",
      "&",
      "/",
      "(",
      ")",
      "=",
      "ß",
      "?",
      "´",
      "^",
      "'",
      "ü",
      "ö",
      "ä",
      "*",
      "+",
      ";",
      ":",
      ",",
      ".",
      "<",
      ">",
      "-",
      "»",
      "«",
    ];
    for (const key of [...letters, ...digits, ...punctuation]) {
      const finger = FINGERS[key];
      expect(finger, `fehlende Zuordnung für ${key}`).toBeDefined();
      expect(finger!.digit, `unerwarteter Daumen für ${key}`).not.toBe("thumb");
    }
  });
});
