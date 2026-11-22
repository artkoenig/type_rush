import { TEXTS } from "../content/textPool";
import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_DURATION,
  LOBBY_DURATION,
  MAX_PLAYERS,
  ROUND_DURATION,
  createGame,
  step,
  toSnapshot,
  wertung,
  type GameEvent,
  type GameState,
  type PlayerState,
  type Snapshot,
} from "./engine";

/** Applies a batch of events in order; returns the final state and all snapshots. */
function run(
  state: GameState,
  events: GameEvent[],
  rng: () => number = Math.random,
): { state: GameState; snapshots: Snapshot[] } {
  let current = state;
  const snapshots: Snapshot[] = [];
  for (const event of events) {
    const result = step(current, event, rng);
    current = result.newState;
    snapshots.push(...result.snapshots);
  }
  return { state: current, snapshots };
}

/**
 * Applies `n` ticks. Time is modeled by the tick count (the engine's `timeRemaining`
 * decrements by one per tick), so no clock is needed. Returns the final state and all snapshots.
 */
function tickN(
  state: GameState,
  n: number,
  rng: () => number = Math.random,
): { state: GameState; snapshots: Snapshot[] } {
  let current = state;
  const snapshots: Snapshot[] = [];
  for (let i = 0; i < n; i++) {
    const result = step(current, { type: "tick" }, rng);
    current = result.newState;
    snapshots.push(...result.snapshots);
  }
  return { state: current, snapshots };
}

/** A player with zeroed counters; `overrides` sets any field. */
function mkPlayer(id: string, nickname: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return { id, nickname, correct: 0, errors: 0, cursor: 0, lastTypedAt: null, ...overrides };
}

/** A game in the lobby with the given roster (bypasses join → spectator). */
function lobbyGame(...players: PlayerState[]): GameState {
  return {
    ...createGame(),
    phase: "lobby",
    players,
    spectators: [],
    timeRemaining: LOBBY_DURATION,
  };
}

/** A game in the countdown with the given roster. */
function countdownGame(...players: PlayerState[]): GameState {
  return {
    ...createGame(),
    phase: "countdown",
    players,
    spectators: [],
    timeRemaining: COUNTDOWN_DURATION,
  };
}

/** A game in a round with the given text and roster. */
function roundGame(text: string, ...players: PlayerState[]): GameState {
  return {
    ...createGame(),
    phase: "round",
    players,
    spectators: [],
    text,
    timeRemaining: ROUND_DURATION,
    roundNumber: 1,
  };
}

/**
 * A lobby that has just finished a round: the roster is empty, the former players are
 * spectators, and `lastRoundResults` holds their final scores (the "results" view).
 */
function lobbyAfterRound(...results: PlayerState[]): GameState {
  return {
    ...createGame(),
    phase: "lobby",
    players: [],
    spectators: results.map((p) => ({ id: p.id, nickname: p.nickname })),
    lastRoundResults: results,
    timeRemaining: LOBBY_DURATION,
    winnerId: results.length > 0 ? results[0].id : null,
    roundNumber: 1,
  };
}

const last = <T>(arr: T[]): T => arr[arr.length - 1];

/** Joins and signs up `n` players (p0..p{n-1}) so the lobby has a full/partial roster. */
function roster(n: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    events.push({ type: "join", playerId: `p${i}`, nickname: `P${i}` });
    events.push({ type: "signUp", playerId: `p${i}` });
  }
  return events;
}

describe("engine", () => {
  it("creates an empty game in the lobby", () => {
    const game = createGame();
    expect(game.phase).toBe("lobby");
    expect(game.players).toHaveLength(0);
    expect(game.spectators).toHaveLength(0);
    expect(game.lastRoundResults).toHaveLength(0);
    expect(game.timeRemaining).toBe(LOBBY_DURATION);
    expect(game.winnerId).toBeNull();
    expect(game.roundNumber).toBe(0);
    expect(game.text).toBe("");
  });

  describe("join", () => {
    it("adds a spectator (there is no host)", () => {
      const { state } = run(createGame(), [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
      ]);
      expect(state.players).toHaveLength(0);
      expect(state.spectators.map((s) => s.id)).toEqual(["p1", "p2"]);
    });

    it("rejects a second join from the same player", () => {
      const first = step(createGame(), { type: "join", playerId: "p1", nickname: "Alice" });
      const dup = step(first.newState, { type: "join", playerId: "p1", nickname: "Again" });
      expect(dup.newState).toBe(first.newState); // same reference: nothing changed
      expect(dup.snapshots).toHaveLength(0);
    });

    it("rejects a join from someone already in the roster", () => {
      const game = roundGame("hallo", mkPlayer("p1", "Alice"));
      const result = step(game, { type: "join", playerId: "p1", nickname: "Alice" });
      expect(result.newState).toBe(game);
      expect(result.snapshots).toHaveLength(0);
    });

    it("allows a join during a round (stays a spectator)", () => {
      const { state } = run(roundGame("hallo", mkPlayer("p1", "Alice")), [
        { type: "join", playerId: "p9", nickname: "Late" },
      ]);
      expect(state.phase).toBe("round");
      expect(state.players).toHaveLength(1);
      expect(state.spectators.map((s) => s.id)).toEqual(["p9"]);
    });

    it("allows a join in the lobby after a round (stays a spectator)", () => {
      const { state } = run(lobbyAfterRound(mkPlayer("p1", "Alice")), [
        { type: "join", playerId: "p9", nickname: "Late" },
      ]);
      expect(state.phase).toBe("lobby");
      expect(state.spectators.map((s) => s.id)).toEqual(["p1", "p9"]);
    });
  });

  describe("signUp", () => {
    it("moves a spectator to the roster and loads the 30s timer when the roster was empty", () => {
      const { state } = run(createGame(), [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "signUp", playerId: "p1" },
      ]);
      expect(state.players.map((p) => p.id)).toEqual(["p1"]);
      expect(state.spectators).toHaveLength(0);
      expect(state.timeRemaining).toBe(LOBBY_DURATION);
    });

    it("keeps the running timer when the roster was not empty", () => {
      const withOne = lobbyGame(mkPlayer("p1", "Alice"));
      const { state } = run({ ...withOne, timeRemaining: 20 }, [
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "signUp", playerId: "p2" },
      ]);
      expect(state.players).toHaveLength(2);
      expect(state.timeRemaining).toBe(20);
    });

    it("rejects signUp outside the lobby", () => {
      const { state } = run(roundGame("hallo", mkPlayer("p1", "Alice")), [
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "signUp", playerId: "p2" },
      ]);
      expect(state.players).toHaveLength(1); // p2 stays a spectator
      expect(state.spectators.map((s) => s.id)).toEqual(["p2"]);
    });

    it("rejects signUp for someone who is already a player", () => {
      const { state } = run(lobbyGame(mkPlayer("p1", "Alice")), [
        { type: "signUp", playerId: "p1" },
      ]);
      expect(state.players).toHaveLength(1);
      expect(state.spectators).toHaveLength(0);
    });

    it("rejects signUp when the roster is full", () => {
      const full = lobbyGame(
        ...Array.from({ length: MAX_PLAYERS }, (_, i) => mkPlayer(`p${i}`, `P${i}`)),
      );
      const { state } = run(full, [
        { type: "join", playerId: "p9", nickname: "Extra" },
        { type: "signUp", playerId: "p9" },
      ]);
      expect(state.players).toHaveLength(MAX_PLAYERS);
      expect(state.spectators.map((s) => s.id)).toEqual(["p9"]);
    });
  });

  describe("lobby timer", () => {
    it("runs only when at least one player has signed up", () => {
      const empty = createGame();
      const idle = step(empty, { type: "tick" });
      expect(idle.newState).toBe(empty); // no players: timer is idle, no snapshot
      const withOne = lobbyGame(mkPlayer("p1", "Alice"));
      const running = step(withOne, { type: "tick" });
      expect(running.newState.timeRemaining).toBe(LOBBY_DURATION - 1);
    });

    it("ignores a tick when the phase timer is already exhausted", () => {
      const roundDone = { ...roundGame("hallo", mkPlayer("p1", "Alice")), timeRemaining: 0 };
      const idleRound = step(roundDone, { type: "tick" });
      expect(idleRound.newState).toBe(roundDone); // no snapshot
      const lobbyDone = { ...lobbyGame(mkPlayer("p1", "Alice")), timeRemaining: 0 };
      const idleLobby = step(lobbyDone, { type: "tick" });
      expect(idleLobby.newState).toBe(lobbyDone); // no snapshot
    });

    it("reloads the timer when it hits 0 with fewer than 2 players", () => {
      const one = lobbyGame(mkPlayer("p1", "Alice"));
      const { state } = tickN(one, LOBBY_DURATION);
      expect(state.phase).toBe("lobby");
      expect(state.timeRemaining).toBe(LOBBY_DURATION); // reloaded, still waiting for a 2nd player
    });

    it("starts the countdown when the timer hits 0 with 2+ players", () => {
      const two = lobbyGame(mkPlayer("p1", "Alice"), mkPlayer("p2", "Bob"));
      const { state } = tickN(two, LOBBY_DURATION);
      expect(state.phase).toBe("countdown");
      expect(state.timeRemaining).toBe(COUNTDOWN_DURATION);
    });

    it("starts the countdown immediately when the roster is full", () => {
      const { state } = run(createGame(), roster(MAX_PLAYERS));
      expect(state.phase).toBe("countdown");
      expect(state.players).toHaveLength(MAX_PLAYERS);
    });
  });

  describe("countdown", () => {
    it("auto-starts the round when it hits 0", () => {
      const cd = countdownGame(mkPlayer("p1", "Alice"), mkPlayer("p2", "Bob"));
      const { state } = tickN(cd, COUNTDOWN_DURATION);
      expect(state.phase).toBe("round");
      expect(state.timeRemaining).toBe(ROUND_DURATION);
      expect(state.roundNumber).toBe(1);
      expect(state.winnerId).toBeNull();
      expect(TEXTS).toContain(state.text);
      expect(state.players).toHaveLength(2);
    });

    it("resets the per-round counters of every player when the round starts", () => {
      const dirty = countdownGame(
        mkPlayer("p1", "Alice", { correct: 5, errors: 2, cursor: 5, lastTypedAt: 3 }),
        mkPlayer("p2", "Bob", { correct: 1, errors: 1, cursor: 1, lastTypedAt: 2 }),
      );
      const { state } = tickN(dirty, COUNTDOWN_DURATION);
      for (const p of state.players) {
        expect(p).toMatchObject({ correct: 0, errors: 0, cursor: 0, lastTypedAt: null });
      }
    });
  });

  describe("round keystrokes", () => {
    it("counts a correct keystroke and advances the cursor", () => {
      const { state } = run(roundGame("hallo", mkPlayer("p1", "Alice")), [
        { type: "keystroke", playerId: "p1", key: "h" },
        { type: "keystroke", playerId: "p1", key: "a" },
      ]);
      expect(state.players[0]).toMatchObject({ correct: 2, errors: 0, cursor: 2 });
    });

    it("counts a wrong keystroke as an error without advancing the cursor (blocking, ADR 0003)", () => {
      const { state } = run(roundGame("hallo", mkPlayer("p1", "Alice")), [
        { type: "keystroke", playerId: "p1", key: "x" },
        { type: "keystroke", playerId: "p1", key: "h" },
      ]);
      expect(state.players[0]).toMatchObject({ correct: 1, errors: 1, cursor: 1 });
    });

    it("ignores multi-character keys", () => {
      const { state } = run(roundGame("hallo", mkPlayer("p1", "Alice")), [
        { type: "keystroke", playerId: "p1", key: "ab" },
      ]);
      expect(state.players[0]).toMatchObject({ correct: 0, errors: 0, cursor: 0 });
    });

    it("ignores keystrokes for a player who already finished the text", () => {
      const { state } = run(roundGame("ab", mkPlayer("p1", "Alice"), mkPlayer("p2", "Bob")), [
        { type: "keystroke", playerId: "p1", key: "a" },
        { type: "keystroke", playerId: "p1", key: "b" }, // p1 finishes
        { type: "keystroke", playerId: "p1", key: "a" }, // after finish: ignored
      ]);
      const p1 = state.players.find((p) => p.id === "p1")!;
      expect(p1).toMatchObject({ correct: 2, errors: 0, cursor: 2 });
    });

    it("ignores keystrokes from a spectator (not in the roster)", () => {
      const game = roundGame("hallo", mkPlayer("p1", "Alice"));
      const withSpectator = run(game, [{ type: "join", playerId: "p9", nickname: "Late" }]).state;
      const result = step(withSpectator, { type: "keystroke", playerId: "p9", key: "h" });
      expect(result.newState).toBe(withSpectator);
    });

    it("ignores a finished player's keys while another player is still typing", () => {
      const game = roundGame("ab", mkPlayer("p1", "Alice"), mkPlayer("p2", "Bob"));
      const done = run(game, [
        { type: "keystroke", playerId: "p1", key: "a" },
        { type: "keystroke", playerId: "p1", key: "b" }, // p1 finished; p2 not → round continues
      ]).state;
      expect(done.phase).toBe("round");
      const result = step(done, { type: "keystroke", playerId: "p1", key: "a" });
      expect(result.newState).toBe(done); // finished: ignored
    });

    it("ignores keystrokes outside the round phase", () => {
      const { state } = run(lobbyGame(mkPlayer("p1", "Alice")), [
        { type: "keystroke", playerId: "p1", key: "h" },
      ]);
      expect(state.players[0]).toMatchObject({ correct: 0, errors: 0, cursor: 0 });
    });
  });

  describe("round end", () => {
    it("ends the round when the timer hits 0 and picks the highest-Wertung winner", () => {
      const text = "a".repeat(20);
      const game = roundGame(text, mkPlayer("p1", "Clean"), mkPlayer("p2", "Sloppy"));
      const typed = run(game, [
        ...Array.from({ length: 10 }, () => ({
          type: "keystroke" as const,
          playerId: "p1",
          key: "a",
        })),
        ...Array.from({ length: 5 }, () => ({
          type: "keystroke" as const,
          playerId: "p2",
          key: "a",
        })),
        ...Array.from({ length: 5 }, () => ({
          type: "keystroke" as const,
          playerId: "p2",
          key: "x",
        })),
      ]);
      const { state } = tickN(typed.state, ROUND_DURATION);
      expect(state.phase).toBe("lobby"); // round ends directly in the lobby
      expect(state.timeRemaining).toBe(LOBBY_DURATION);
      expect(state.winnerId).toBe("p1");
      expect(state.players).toHaveLength(0);
      expect(state.spectators.map((s) => s.id)).toEqual(["p1", "p2"]);
      expect(state.lastRoundResults).toHaveLength(2);
    });

    it("ends the round immediately when all players have typed the full text", () => {
      const game = roundGame("ab", mkPlayer("p1", "Alice"), mkPlayer("p2", "Bob"));
      let s = run(game, [{ type: "keystroke", playerId: "p1", key: "a" }]).state;
      s = run(s, [{ type: "keystroke", playerId: "p1", key: "b" }]).state;
      expect(s.phase).toBe("round"); // p2 has not started yet
      s = run(s, [{ type: "keystroke", playerId: "p2", key: "a" }]).state;
      s = run(s, [{ type: "keystroke", playerId: "p2", key: "x" }]).state; // error, cursor still 1
      s = run(s, [{ type: "keystroke", playerId: "p2", key: "b" }]).state;
      expect(s.phase).toBe("lobby"); // p2 finished → all done
      expect(s.winnerId).toBe("p1"); // 2c/0e beats 2c/1e
    });

    it("picks no winner when the roster is empty", () => {
      const { state } = tickN(roundGame("ab"), ROUND_DURATION);
      expect(state.phase).toBe("lobby");
      expect(state.winnerId).toBeNull();
    });
  });

  describe("lobby after a round", () => {
    it("keeps the highscore table and winner in the lobby (a client-side results view)", () => {
      const game = lobbyAfterRound(
        mkPlayer("p1", "Alice", { correct: 10, errors: 0 }),
        mkPlayer("p2", "Bob", { correct: 5, errors: 0 }),
      );
      const snap = toSnapshot(game);
      expect(snap.phase).toBe("lobby");
      expect(snap.players).toHaveLength(0);
      expect(snap.spectators.map((s) => s.id)).toEqual(["p1", "p2"]);
      expect(snap.winnerId).toBe("p1");
      // the highscore table is ranked by final Wertung (full round duration)
      expect(snap.lastRoundResults.map((p) => p.id)).toEqual(["p1", "p2"]);
      expect(snap.lastRoundResults[0].wertung).toBe(wertung(10, 0, ROUND_DURATION));
      expect(snap.lastRoundResults[1].wertung).toBe(wertung(5, 0, ROUND_DURATION));
    });

    it("clears the highscore table and winner when the next game starts", () => {
      const game = {
        ...lobbyAfterRound(mkPlayer("p1", "Alice", { correct: 10, errors: 0 })),
        players: [mkPlayer("p1", "Alice"), mkPlayer("p2", "Bob")],
        spectators: [],
      };
      const { state } = tickN(game, LOBBY_DURATION); // 2 players → countdown
      expect(state.phase).toBe("countdown");
      expect(state.lastRoundResults).toHaveLength(0);
      expect(state.winnerId).toBeNull();
    });
  });

  describe("disconnect", () => {
    it("removes a spectator in the lobby", () => {
      const { state } = run(createGame(), [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "disconnect", playerId: "p2" },
      ]);
      expect(state.spectators.map((s) => s.id)).toEqual(["p1"]);
    });

    it("reloads the lobby timer when the last player leaves", () => {
      const one = { ...lobbyGame(mkPlayer("p1", "Alice")), timeRemaining: 20 };
      const { state } = run(one, [{ type: "disconnect", playerId: "p1" }]);
      expect(state.players).toHaveLength(0);
      expect(state.timeRemaining).toBe(LOBBY_DURATION);
    });

    it("keeps the timer when a non-last player leaves in the lobby", () => {
      const game = {
        ...lobbyGame(mkPlayer("p1", "Alice"), mkPlayer("p2", "Bob")),
        timeRemaining: 20,
      };
      const { state } = run(game, [{ type: "disconnect", playerId: "p1" }]);
      expect(state.players.map((p) => p.id)).toEqual(["p2"]);
      expect(state.timeRemaining).toBe(20); // roster not empty: timer untouched
    });

    it("removes a player from the roster during a round (the round continues)", () => {
      const { state } = run(roundGame("hallo", mkPlayer("p1", "Alice"), mkPlayer("p2", "Bob")), [
        { type: "disconnect", playerId: "p1" },
      ]);
      expect(state.phase).toBe("round");
      expect(state.players.map((p) => p.id)).toEqual(["p2"]);
    });

    it("clears the winner when the winner leaves in the lobby (no re-derivation)", () => {
      const game = lobbyAfterRound(
        mkPlayer("p1", "Alice", { correct: 10, errors: 0 }),
        mkPlayer("p2", "Bob", { correct: 5, errors: 0 }),
      );
      const { state } = run(game, [{ type: "disconnect", playerId: "p1" }]);
      expect(state.phase).toBe("lobby");
      expect(state.winnerId).toBeNull(); // cleared, NOT re-derived from the (empty) roster
      expect(state.spectators.map((s) => s.id)).toEqual(["p2"]);
      // the highscore table is fixed: it still lists the winner
      expect(state.lastRoundResults.map((p) => p.id)).toEqual(["p1", "p2"]);
    });

    it("keeps the winner when a non-winner leaves in the lobby", () => {
      const game = lobbyAfterRound(
        mkPlayer("p1", "Alice", { correct: 10, errors: 0 }),
        mkPlayer("p2", "Bob", { correct: 5, errors: 0 }),
      );
      const { state } = run(game, [{ type: "disconnect", playerId: "p2" }]);
      expect(state.winnerId).toBe("p1");
      expect(state.spectators.map((s) => s.id)).toEqual(["p1"]);
    });

    it("clears the winner when the winner was the only spectator", () => {
      const game = lobbyAfterRound(mkPlayer("p1", "Alice", { correct: 10, errors: 0 }));
      const { state } = run(game, [{ type: "disconnect", playerId: "p1" }]);
      expect(state.winnerId).toBeNull();
      expect(state.spectators).toHaveLength(0);
    });

    it("ignores a disconnect of an unknown player", () => {
      const game = lobbyGame(mkPlayer("p1", "Alice"));
      const result = step(game, { type: "disconnect", playerId: "ghost" });
      expect(result.newState).toBe(game);
      expect(result.snapshots).toHaveLength(0);
    });
  });

  describe("snapshot", () => {
    it("orders players by Wertung descending in a round snapshot", () => {
      const game = roundGame("a".repeat(20), mkPlayer("p1", "Clean"), mkPlayer("p2", "Sloppy"));
      const t10 = tickN(game, 10); // 10s elapsed when they type
      const typed = run(t10.state, [
        ...Array.from({ length: 10 }, () => ({
          type: "keystroke" as const,
          playerId: "p1",
          key: "a",
        })),
        ...Array.from({ length: 12 }, () => ({
          type: "keystroke" as const,
          playerId: "p2",
          key: "a",
        })),
        ...Array.from({ length: 6 }, () => ({
          type: "keystroke" as const,
          playerId: "p2",
          key: "x",
        })),
      ]);
      const snap = last(typed.snapshots);
      expect(snap.players.map((p) => p.id)).toEqual(["p1", "p2"]);
      expect(snap.players[0].wertung).toBeGreaterThan(snap.players[1].wertung);
    });

    it("exposes text, timeRemaining, roundNumber and spectators", () => {
      const snap = toSnapshot(roundGame("hallo", mkPlayer("p1", "Alice")));
      expect(snap.phase).toBe("round");
      expect(snap.text).toBe("hallo");
      expect(snap.timeRemaining).toBe(ROUND_DURATION);
      expect(snap.roundNumber).toBe(1);
      expect(snap.winnerId).toBeNull();
      expect(snap.players).toHaveLength(1);
      expect(snap.spectators).toHaveLength(0);
      expect(snap.lastRoundResults).toHaveLength(0);
    });
  });

  describe("stable scoring", () => {
    it("keeps a stable score for a player who has NOT finished across ticks", () => {
      const game = roundGame("a".repeat(20), mkPlayer("p1", "Alice"));
      const t10 = tickN(game, 10); // elapsed 10s when typing
      const afterType = run(
        t10.state,
        Array.from({ length: 10 }, () => ({
          type: "keystroke" as const,
          playerId: "p1",
          key: "a",
        })),
      );
      const before = last(afterType.snapshots).players.find((p) => p.id === "p1")!.wertung;
      const t20 = tickN(afterType.state, 10);
      const after = last(t20.snapshots).players.find((p) => p.id === "p1")!.wertung;
      expect(after).toBe(before);
    });

    it("keeps a stable score for a finished player across ticks (regression)", () => {
      const game = roundGame("hallo", mkPlayer("p1", "Alice"), mkPlayer("p2", "Bob"));
      const t10 = tickN(game, 10);
      const afterFinish = run(
        t10.state,
        ["h", "a", "l", "l", "o"].map((key) => ({
          type: "keystroke" as const,
          playerId: "p1",
          key,
        })),
      );
      const atFinish = last(afterFinish.snapshots).players.find((p) => p.id === "p1")!.wertung;
      const t20 = tickN(afterFinish.state, 10);
      const afterTick = last(t20.snapshots).players.find((p) => p.id === "p1")!.wertung;
      expect(afterTick).toBe(atFinish);
    });
  });

  it("rewards technique: slow+correct beats fast+inaccurate in the final results", () => {
    const game = roundGame("a".repeat(20), mkPlayer("p1", "Clean"), mkPlayer("p2", "Sloppy"));
    const typed = run(game, [
      ...Array.from({ length: 10 }, () => ({
        type: "keystroke" as const,
        playerId: "p1",
        key: "a",
      })),
      ...Array.from({ length: 12 }, () => ({
        type: "keystroke" as const,
        playerId: "p2",
        key: "a",
      })),
      ...Array.from({ length: 6 }, () => ({
        type: "keystroke" as const,
        playerId: "p2",
        key: "x",
      })),
    ]);
    const { state } = tickN(typed.state, ROUND_DURATION);
    const snap = toSnapshot(state);
    expect(snap.winnerId).toBe("p1");
    // In the lobby the final scores live in lastRoundResults, ranked by full duration.
    const p1 = snap.lastRoundResults.find((p) => p.id === "p1")!;
    const p2 = snap.lastRoundResults.find((p) => p.id === "p2")!;
    expect(p1.wertung).toBe(wertung(10, 0, ROUND_DURATION));
    expect(p2.wertung).toBe(wertung(12, 6, ROUND_DURATION));
    expect(p1.wertung).toBeGreaterThan(p2.wertung);
  });

  it("runs the full hostless cycle: lobby → countdown → round → lobby", () => {
    let state = createGame();
    state = run(state, roster(2)).state; // 2 players in the lobby
    expect(state.phase).toBe("lobby");
    state = tickN(state, LOBBY_DURATION).state;
    expect(state.phase).toBe("countdown");
    state = tickN(state, COUNTDOWN_DURATION).state;
    expect(state.phase).toBe("round");
    expect(state.roundNumber).toBe(1);
    expect(state.timeRemaining).toBe(ROUND_DURATION);
    state = tickN(state, ROUND_DURATION).state;
    expect(state.phase).toBe("lobby"); // round ends directly in the lobby
    expect(state.timeRemaining).toBe(LOBBY_DURATION);
    expect(state.players).toHaveLength(0);
    expect(state.spectators).toHaveLength(2);
    expect(state.lastRoundResults).toHaveLength(2);
    expect(state.roundNumber).toBe(1); // round counter is not reset
  });
});
