# 04: Game Engine

**What to build:** The complete pure, deterministic, event-driven game engine — the single test seam of the system. It consumes a stream of events (join, start, keystroke, tick, disconnect) plus round config, maintains per-player state, and emits state snapshots. All game rules from the spec live here: lobby management, Start-Recht rotation, round lifecycle, blocking errors (ADR 0003), fixed-time progression, Wertung computation, leaderboard ordering, disconnect handling, host-leave → GameOver, and back-to-lobby with rotation. The engine is decoupled from transport and UI; a controlled clock is injected, never wall-clock.

**Blocked by:** 01 (Scaffolding)

**Status:** ready-for-agent

- [ ] Engine is a pure module: `step(state, event, clock) => { newState, snapshots }` — no I/O, no wall-clock, no side effects
- [ ] **Join:** player joins lobby with nickname; max 8 players; no double-join; host auto-joins on connect (default nickname "Host")
- [ ] **Start-Recht:** earliest joiner holds it; rotates to next player after each round; if holder leaves lobby, next in queue inherits; round may start with 1+ players (solo)
- [ ] **Round start:** no countdown; all players receive the same text (passed in via start event); timer begins
- [ ] **Keystroke handling (ADR 0003):** correct key advances cursor; wrong key does NOT advance cursor, marks position as error, counts toward accuracy; every wrong press is an error
- [ ] **Timer:** tick events advance the clock; when timeRemaining reaches 0, round ends
- [ ] **Wertung:** `score = accuracy² × (correctChars / durationSec) × 100` using integer arithmetic; 0 if no keypresses; slow+correct beats fast+inaccurate
- [ ] **Leaderboard:** players ordered by Wertung (descending), updated on each snapshot
- [ ] **Disconnect:** player removed from round and leaderboard; if last non-host player leaves mid-round, round runs to completion; empty results → GameOver (defensive)
- [ ] **Host leave:** immediately ends the game for everyone (GameOver)
- [ ] **Back to lobby:** after results, all remaining players return to lobby; Start-Recht rotates
- [ ] **Duration:** host-selectable (30/60/120s), 60s default; only host can change it
- [ ] Tests cover all behaviors above using injected clock and event sequences; assert on emitted snapshots and final results only (external behavior, per spec testing decisions)
