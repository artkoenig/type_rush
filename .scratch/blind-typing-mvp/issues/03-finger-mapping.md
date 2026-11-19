# 03: Finger-Mapping

**What to build:** A pure function mapping each QWERTZ key to the finger that should press it (left/right × pinky/ring/middle/index/thumb), suitable for driving the frontend Finger-Hinweis diagram. The mapping covers all printable QWERTZ keys. It is a learning aid only — not part of the Wertung.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Function signature: `(key: string) => Finger` where Finger is a discriminated union (side: left|right, digit: pinky|ring|middle|index|thumb)
- [x] Covers all QWERTZ printable keys (letters, digits, common punctuation)
- [x] Unknown/unsupported keys return a sensible default (e.g. thumb or a "no hint" sentinel)
- [x] Tests verify home-row keys map to the correct fingers per standard touch-typing ergonomics
- [x] Exported from a module importable by both the engine (if needed) and the frontend

## Umsetzung

- `src/engine/fingerMap.ts` (neu): `Side`, `Digit`, `Finger` (diskriminierte Union über `side`),
  `FINGERS` (Tabelle aller druckbaren QWERTZ-Tasten inkl. Shift-Varianten → Finger),
  `DEFAULT_FINGER` (rechter Daumen) und `fingerFor(key)`.
- QWERTZ-spezifisch: `z` → linker Zeigefinger, `y` → linker Kleinfinger (der QWERTY-Tausch);
  Umlaute `ä ö ü ß` und deutsche Sonderzeichen (`§ » « ? ^ …`) nach ihrer echten QWERTZ-Position.
- `fingerFor` ist case-insensitiv (`toLowerCase`-Lookup); Mehrzeichen-Eingaben und unbekannte
  Zeichen liefern `DEFAULT_FINGER`.
- `src/engine/fingerMap.test.ts` (neu): 8 Tests – Home-Row-Ergonomie, QWERTZ-Tausch,
  Zahlreihe, Umlaute, Case-Insensitivität, Leertaste→Daumen, Default-Fallback,
  Vollabdeckung (26 Buchstaben + 10 Ziffern + 29 Sonderzeichen).
- Gate-Status: typecheck ✓, lint ✓, prettier ✓, 20 Tests ✓, 100 % Coverage, CRAP-Gate exit 0.
