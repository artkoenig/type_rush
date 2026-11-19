# 04: Game Engine

**What to build:** The complete pure, deterministic, event-driven game engine — the single test seam of the system. It consumes a stream of events (join, start, keystroke, tick, disconnect) plus round config, maintains per-player state, and emits state snapshots. All game rules from the spec live here: lobby management, Start-Recht rotation, round lifecycle, blocking errors (ADR 0003), fixed-time progression, Wertung computation, leaderboard ordering, disconnect handling, host-leave → GameOver, and back-to-lobby with rotation. The engine is decoupled from transport and UI; a controlled clock is injected, never wall-clock.

**Blocked by:** 01 (Scaffolding)

**Status:** done

- [x] Engine is a pure module: `step(state, event, clock) => { newState, snapshots }` — no I/O, no wall-clock, no side effects
- [x] **Join:** player joins lobby with nickname; max 8 players; no double-join; host auto-joins on connect (default nickname "Host")
- [x] **Start-Recht:** earliest joiner holds it; rotates to next player after each round; if holder leaves lobby, next in queue inherits; round may start with 1+ players (solo)
- [x] **Round start:** no countdown; all players receive the same text (passed in via start event); timer begins
- [x] **Keystroke handling (ADR 0003):** correct key advances cursor; wrong key does NOT advance cursor, marks position as error, counts toward accuracy; every wrong press is an error
- [x] **Timer:** tick events advance the clock; when timeRemaining reaches 0, round ends
- [x] **Wertung:** `score = accuracy² × (correctChars / durationSec) × 100` using integer arithmetic; 0 if no keypresses; slow+correct beats fast+inaccurate
- [x] **Leaderboard:** players ordered by Wertung (descending), updated on each snapshot
- [x] **Disconnect:** player removed from round and leaderboard; if last non-host player leaves mid-round, round runs to completion; empty results → GameOver (defensive)
- [x] **Host leave:** immediately ends the game for everyone (GameOver)
- [x] **Back to lobby:** after results, all remaining players return to lobby; Start-Recht rotates
- [x] **Duration:** host-selectable (30/60/120s), 60s default; only host can change it
- [x] Tests cover all behaviors above using injected clock and event sequences; assert on emitted snapshots and final results only (external behavior, per spec testing decisions)

## Umsetzung

- `src/engine/engine.ts` (neu): `step(state, event, clock)` als einzige Nahtstelle —
  rein, deterministisch, injizierter `Clock` (nie Wall-Clock). Exportiert `Phase`,
  `PlayerState`, `GameState`, `GameEvent`, `Snapshot`, `MAX_PLAYERS = 8`,
  `DEFAULT_NICKNAME = "Host"`, `wertung()`, `createGame(hostId)`.
- `step` lehnt ungültige Events (falsche Phase, unbekannter Spieler, doppeltes Join,
  > 8 Spieler) ab: gleicher State-Referenz, keine Snapshots. Bei Annahme genau ein
  `Snapshot` (alle Spieler mit `total` und `wertung`).
- **Join:** Host auto-join via `createGame(hostId)`; Nickname-Default "Host";
  Doppel-Join und > 8 Spieler abgelehnt.
- **Start-Recht:** frühester Joiner; rotiert nach jeder Runde an den nächsten;
  verlässt der Inhaber die Lobby, erbt der nächste in der Queue (`players[0]`);
  Start ab 1 Spieler (Solo) erlaubt, ohne Countdown.
- **Keystroke (ADR 0003):** richtige Taste → Cursor vor; falsche Taste → Cursor bleibt,
  Fehler gezählt; Tastendrücke nach Textende und `key.length !== 1` werden ignoriert.
- **Timer:** `tick`-Events bewegen `timeRemaining`; bei 0 endet die Runde,
  `winnerId` = Spitzenreiter (Host spielt immer mit → nie 0 Spieler am Rundenende).
- **Wertung:** `100 · correct³ / (total² · durationSec)` als Integer, 0 ohne
  Tastendrücke; langsam+korrekt schlägt schnell+ungenau (Spec-Beispiel 16 > 8).
- **Leaderboard:** absteigend nach Wertung, stabile Sortierung (Gleichstand →
  Join-Reihenfolge).
- **Disconnect:** Host verlässt → sofort GameOver (jede Phase). Letzter Nicht-Host
  verlässt in der Runde → Runde läuft zu Ende, Solo-Ergebnis; leeres Ergebnis →
  GameOver (defensiv, via direkter GameState-Konstruktion getestet).
- **Back-to-Lobby:** aus den Ergebnissen zurück in die Lobby, Start-Recht rotiert;
  jeder verbundene Spieler darf es anstoßen.
- **Duration:** nur Host, 30/60/120 s, Default 60 s.
- `src/engine/engine.test.ts` (neu): 46 Tests über injizierte Clock und
  Event-Sequenzen, ausschließlich externe Verhalten (Snapshots/Endergebnisse):
  createGame, Join, Start-Recht, Rundenstart, Keystroke, Timer, Wertung,
  Leaderboard, Disconnect, Back-to-Lobby, Duration, Purity.
- Gate-Status: typecheck ✓, lint ✓, prettier ✓, 65 Tests ✓ (3 Dateien),
  CRAP-Gate exit 0 (höchster CRAP-Wert 7.0, Threshold 10.0).
