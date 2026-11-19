# 02: Deutscher Text-Pool

**What to build:** A curated, bundled list of common German words/sentences suitable for QWERTZ typing, plus a pure calibration function that selects a text whose length matches the round duration (linear scaling ~1–1.3 chars/sec: 30s → 30–40 chars, 60s → 60–80 chars, 120s → 120–160 chars). Given a duration, the function returns one randomly chosen text of appropriate length.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Text list contains at least 20 entries spanning all three duration buckets (30s, 60s, 120s)
- [ ] All texts use only QWERTZ-home-row-reachable characters (no exotic keys)
- [ ] Calibration function is pure: `(duration: 30|60|120, rng?) => string`
- [ ] Tests verify: each duration bucket returns a text within its length range; repeated calls with seeded RNG are deterministic
