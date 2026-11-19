# 03: Finger-Mapping

**What to build:** A pure function mapping each QWERTZ key to the finger that should press it (left/right × pinky/ring/middle/index/thumb), suitable for driving the frontend Finger-Hinweis diagram. The mapping covers all printable QWERTZ keys. It is a learning aid only — not part of the Wertung.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Function signature: `(key: string) => Finger` where Finger is a discriminated union (side: left|right, digit: pinky|ring|middle|index|thumb)
- [ ] Covers all QWERTZ printable keys (letters, digits, common punctuation)
- [ ] Unknown/unsupported keys return a sensible default (e.g. thumb or a "no hint" sentinel)
- [ ] Tests verify home-row keys map to the correct fingers per standard touch-typing ergonomics
- [ ] Exported from a module importable by both the engine (if needed) and the frontend
