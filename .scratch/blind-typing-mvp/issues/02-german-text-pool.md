# 02: Deutscher Text-Pool

**What to build:** A curated, bundled list of common German words/sentences suitable for QWERTZ typing, plus a pure calibration function that selects a text whose length matches the round duration (linear scaling ~1–1.3 chars/sec: 30s → 30–40 chars, 60s → 60–80 chars, 120s → 120–160 chars). Given a duration, the function returns one randomly chosen text of appropriate length.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Text list contains at least 20 entries spanning all three duration buckets (30s, 60s, 120s)
- [x] All texts use only QWERTZ-home-row-reachable characters (no exotic keys)
- [x] Calibration function is pure: `(duration: 30|60|120, rng?) => string`
- [x] Tests verify: each duration bucket returns a text within its length range; repeated calls with seeded RNG are deterministic

## Umsetzung

- `src/content/textPool.ts`: `Duration` (30|60|120), `DURATIONS`, `RANGES` (Ziel-Länge pro Dauer), `TEXTS` (20 kuratierte deutsche Sätze, 8×30s / 6×60s / 6×120s, alle QWERTZ-sicher), `pickRandom` (Pure-Helfer, wirft bei leerer Liste), `calibrateText(duration, rng?)`.
- `src/content/textPool.test.ts`: 11 Tests – Pool-Größe, Bucket-Abdeckung, QWERTZ-Sicherheit, Längenbereich pro Dauer, Pool-Mitgliedschaft, Determinismus, RNG-Respekt, `pickRandom`-Throw-Branch.
- Quality Gates: Typecheck ✓, Lint ✓, Prettier ✓, 12 Tests ✓, 100% Coverage, CRAP-Gate (Threshold 10) ✓.
