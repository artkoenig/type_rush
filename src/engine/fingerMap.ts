/**
 * QWERTZ-Finger-Mapping: ordnet jede druckbare Taste dem Finger zu, der sie
 * nach der Zehn-Finger-Methode drücken sollte. Reine Lernhilfe (Finger-Hinweis)
 * – zählt nicht in die Wertung. Importierbar von Engine und Frontend.
 */

export type Side = "left" | "right";
export type Digit = "pinky" | "ring" | "middle" | "index" | "thumb";

/** Diskriminierte Union: `side` ist der Diskriminator. */
export type Finger = { side: "left"; digit: Digit } | { side: "right"; digit: Digit };

const L = (digit: Digit): Finger => ({ side: "left", digit });
const R = (digit: Digit): Finger => ({ side: "right", digit });

/**
 * Tabelle aller druckbaren QWERTZ-Tasten (kleingeschrieben) → Finger.
 * Enthält Basis-Zeichen und ihre Shift-Varianten (z. B. `1` und `!`).
 */
export const FINGERS: Record<string, Finger> = {
  // linke Hand
  "`": L("pinky"),
  "1": L("pinky"),
  "!": L("pinky"),
  q: L("pinky"),
  a: L("pinky"),
  y: L("pinky"), // QWERTZ: y sitzt an QWERTYs z-Position
  "2": L("ring"),
  '"': L("ring"),
  w: L("ring"),
  s: L("ring"),
  x: L("ring"),
  "3": L("middle"),
  "§": L("middle"),
  e: L("middle"),
  d: L("middle"),
  c: L("middle"),
  "4": L("index"),
  $: L("index"),
  "5": L("index"),
  "%": L("index"),
  r: L("index"),
  t: L("index"),
  z: L("index"), // QWERTZ: z sitzt an QWERTYs y-Position
  f: L("index"),
  g: L("index"),
  v: L("index"),
  b: L("index"),
  // rechte Hand
  "6": R("index"),
  "&": R("index"),
  "7": R("index"),
  "/": R("index"),
  u: R("index"),
  h: R("index"),
  j: R("index"),
  n: R("index"),
  m: R("index"),
  ";": R("index"),
  "8": R("middle"),
  "(": R("middle"),
  i: R("middle"),
  k: R("middle"),
  ",": R("middle"),
  ":": R("middle"),
  "<": R("middle"),
  "9": R("ring"),
  ")": R("ring"),
  o: R("ring"),
  l: R("ring"),
  ".": R("ring"),
  ">": R("ring"),
  ö: R("ring"),
  "»": R("ring"),
  "0": R("pinky"),
  "=": R("pinky"),
  ß: R("pinky"),
  "?": R("pinky"),
  "´": R("pinky"),
  "^": R("pinky"),
  "'": R("pinky"),
  p: R("pinky"),
  ü: R("pinky"),
  "*": R("pinky"),
  ä: R("pinky"),
  "«": R("pinky"),
  "+": R("pinky"),
  "-": R("pinky"),
  // Daumen
  " ": R("thumb"),
};

/** Fallback für unbekannte Tasten (z. B. Sondertasten): Daumen, kein Hinweis. */
export const DEFAULT_FINGER: Finger = { side: "right", digit: "thumb" };

/**
 * Ordnet ein einzelnes Zeichen der Taste zu, die es auf QWERTZ erzeugt.
 * Groß-/Kleinschreibung wird ignoriert; unbekannte Zeichen und
 * Mehrzeichen-Eingaben liefern `DEFAULT_FINGER`.
 */
export function fingerFor(key: string): Finger {
  if (key.length !== 1) return DEFAULT_FINGER;
  return FINGERS[key.toLowerCase()] ?? DEFAULT_FINGER;
}
