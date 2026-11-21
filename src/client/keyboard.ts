import { fingerFor, type Finger } from "../engine/fingerMap.js";
import { el } from "./dom.js";

/** Deutsches QWERTZ-Layout (DIN 2137): vier Reihen, Umlaute und ß an den echten Positionen. */
const ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "ß"],
  ["q", "w", "e", "r", "t", "z", "u", "i", "o", "p", "ü"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ö", "ä"],
  ["y", "x", "c", "v", "b", "n", "m", ";", ",", ".", "-"],
];

/** Label: Buchstaben groß; ß bleibt klein (es gibt keinen großen ß, JS würde "SS" liefern). */
function keyLabel(key: string): string {
  return key === "ß" ? "ß" : key.toUpperCase();
}

const DIGIT_LABELS: Record<Finger["digit"], string> = {
  pinky: "kleiner Finger",
  ring: "Ringfinger",
  middle: "Mittelfinger",
  index: "Zeigefinger",
  thumb: "Daumen",
};

/** German label for a finger, e.g. "linke Hand · Zeigefinger". */
export function fingerLabel(finger: Finger): string {
  const side = finger.side === "left" ? "linke Hand" : "rechte Hand";
  return `${side} · ${DIGIT_LABELS[finger.digit]}`;
}

/**
 * Renders the QWERTZ keyboard diagram. The keycap of the next key is
 * highlighted strongly, all keycaps of the same finger softly.
 */
export function renderKeyboard(container: HTMLElement, nextKey: string | null): void {
  container.replaceChildren();
  const nextFinger = nextKey ? fingerFor(nextKey) : null;

  const sameFinger = (key: string): boolean => {
    if (!nextFinger || !nextKey) return false;
    if (key.toLowerCase() === nextKey.toLowerCase()) return false; // handled by key-next
    const f = fingerFor(key);
    return f.side === nextFinger.side && f.digit === nextFinger.digit;
  };

  for (const row of ROWS) {
    const rowEl = el("div", { class: "kb-row" });
    for (const key of row) {
      const classes = ["key"];
      if (nextKey && key.toLowerCase() === nextKey.toLowerCase()) classes.push("key-next");
      else if (sameFinger(key)) classes.push("key-finger");
      rowEl.append(el("span", { class: classes.join(" "), text: keyLabel(key) }));
    }
    container.append(rowEl);
  }

  const spaceClasses = ["key", "key-space"];
  if (nextKey === " ") spaceClasses.push("key-next");
  else if (nextFinger && sameFinger(" ")) spaceClasses.push("key-finger");
  container.append(
    el("div", { class: "kb-row" }, el("span", { class: spaceClasses.join(" ") }, "Leertaste")),
  );
}
