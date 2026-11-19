import type { Duration } from "../content/textPool";
import { describe, expect, it } from "vitest";
import {
  createGame,
  step,
  type Clock,
  type GameEvent,
  type GameState,
  type Snapshot,
} from "./engine";

/**
 * A controllable clock: starts at `start` (seconds) and only moves when
 * `advance` is called. Keeps every test deterministic (ADR 0001).
 */
function makeClock(start = 0): { clock: Clock; advance: (seconds: number) => void } {
  let now = start;
  return {
    clock: () => now,
    advance: (s) => {
      now += s;
    },
  };
}

/** Applies a batch of events in order; returns the final state and all snapshots. */
function run(
  state: GameState,
  events: GameEvent[],
  clock: Clock,
): { state: GameState; snapshots: Snapshot[] } {
  let current = state;
  const snapshots: Snapshot[] = [];
  for (const event of events) {
    const result = step(current, event, clock);
    current = result.newState;
    snapshots.push(...result.snapshots);
  }
  return { state: current, snapshots };
}

/** A game with one player ("host") in the lobby, ready for a round. */
function lobbyGame(): GameState {
  return {
    ...createGame(),
    phase: "lobby",
    players: [
      {
        id: "host",
        nickname: "Host",
        isHost: true,
        correct: 0,
        errors: 0,
        cursor: 0,
        lastTypedAt: null,
      },
    ],
    startRight: "host",
  };
}

const last = <T>(arr: T[]): T => arr[arr.length - 1];

describe("engine", () => {
  it("creates an empty game in the waiting phase", () => {
    const game = createGame();
    expect(game.phase).toBe("waiting");
    expect(game.players).toHaveLength(0);
    expect(game.startRight).toBeNull();
  });

  it("makes the first joiner the host and grants them the Start-Recht", () => {
    const { clock } = makeClock();
    const { state } = run(
      createGame(),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
      ],
      clock,
    );
    expect(state.phase).toBe("waiting");
    expect(state.players.map((p) => p.isHost)).toEqual([true, false]);
    expect(state.startRight).toBe("p1");
  });

  it("rejects a second join from the same player", () => {
    const { clock } = makeClock();
    const { state } = run(
      createGame(),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p1", nickname: "Alice again" },
      ],
      clock,
    );
    expect(state.players).toHaveLength(1);
  });

  it("caps the game at 8 players", () => {
    const { clock } = makeClock();
    const joins = Array.from({ length: 9 }, (_, i) => ({
      type: "join" as const,
      playerId: `p${i}`,
      nickname: `P${i}`,
    }));
    const { state } = run(createGame(), joins, clock);
    expect(state.players).toHaveLength(8);
  });

  it("moves waiting → lobby only when the host starts the session", () => {
    const { clock } = makeClock();
    const { state: afterNonHost } = run(
      lobbyGame(),
      [
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "startSession", playerId: "p2" },
      ],
      clock,
    );
    expect(afterNonHost.phase).toBe("lobby"); // non-host cannot start
    const { state: afterHost } = run(
      lobbyGame(),
      [{ type: "startSession", playerId: "host" }],
      clock,
    );
    expect(afterHost.phase).toBe("lobby"); // host in lobby: no-op, stays lobby
  });

  it("starts a round only for the player holding the Start-Recht", () => {
    const { clock } = makeClock();
    const { state } = run(
      lobbyGame(),
      [
        { type: "startSession", playerId: "host" },
        { type: "start", playerId: "someone-else", text: "hallo" },
      ],
      clock,
    );
    expect(state.phase).toBe("lobby");
  });

  it("resets per-round player counters when a round starts", () => {
    const { clock } = makeClock();
    const dirty: GameState = {
      ...lobbyGame(),
      players: [
        {
          id: "host",
          nickname: "Host",
          isHost: true,
          correct: 5,
          errors: 2,
          cursor: 5,
          lastTypedAt: 3,
        },
      ],
    };
    const { state } = run(dirty, [{ type: "start", playerId: "host", text: "hallo" }], clock);
    expect(state.phase).toBe("round");
    expect(state.players[0]).toMatchObject({ correct: 0, errors: 0, cursor: 0, lastTypedAt: null });
    expect(state.timeRemaining).toBe(state.duration);
  });

  it("counts a correct keystroke and advances the cursor", () => {
    const { clock } = makeClock();
    const { state } = run(
      lobbyGame(),
      [
        { type: "start", playerId: "host", text: "hallo" },
        { type: "keystroke", playerId: "host", key: "h" },
        { type: "keystroke", playerId: "host", key: "a" },
      ],
      clock,
    );
    expect(state.players[0].correct).toBe(2);
    expect(state.players[0].cursor).toBe(2);
    expect(state.players[0].errors).toBe(0);
  });

  it("counts a wrong keystroke as an error without advancing the cursor (blocking, ADR 0003)", () => {
    const { clock } = makeClock();
    const { state } = run(
      lobbyGame(),
      [
        { type: "start", playerId: "host", text: "hallo" },
        { type: "keystroke", playerId: "host", key: "x" },
        { type: "keystroke", playerId: "host", key: "h" },
      ],
      clock,
    );
    expect(state.players[0]).toMatchObject({ correct: 1, errors: 1, cursor: 1 });
  });

  it("ignores keystrokes for a player who already finished the text", () => {
    const { clock } = makeClock();
    const { state } = run(
      lobbyGame(),
      [
        { type: "start", playerId: "host", text: "ab" },
        { type: "keystroke", playerId: "host", key: "a" },
        { type: "keystroke", playerId: "host", key: "b" },
        { type: "keystroke", playerId: "host", key: "a" }, // after finish: ignored
      ],
      clock,
    );
    expect(state.players[0]).toMatchObject({ correct: 2, errors: 0, cursor: 2 });
  });

  it("ignores multi-character keys", () => {
    const { clock } = makeClock();
    const { state } = run(
      lobbyGame(),
      [
        { type: "start", playerId: "host", text: "hallo" },
        { type: "keystroke", playerId: "host", key: "ab" },
      ],
      clock,
    );
    expect(state.players[0]).toMatchObject({ correct: 0, errors: 0, cursor: 0 });
  });

  it("counts down timeRemaining on tick and ends the round at zero", () => {
    const { clock, advance } = makeClock(0);
    const started = run(
      lobbyGame(),
      [
        { type: "start", playerId: "host", text: "hallo" },
        { type: "setDuration", playerId: "host", duration: 60 },
      ],
      clock,
    ).state;
    // Note: setDuration is lobby-only, so it is a no-op here; duration stays 60 from createGame.
    advance(30);
    const mid = run(started, [{ type: "tick" }], clock);
    expect(mid.state.phase).toBe("round");
    expect(mid.state.timeRemaining).toBe(30);
    advance(30);
    const end = run(mid.state, [{ type: "tick" }], clock);
    expect(end.state.phase).toBe("results");
    expect(end.state.timeRemaining).toBe(0);
  });

  it("ignores ticks outside the round phase", () => {
    const { clock, advance } = makeClock();
    advance(100);
    const { state } = run(createGame(), [{ type: "tick" }], clock);
    expect(state.phase).toBe("waiting");
  });

  it("lets the host change the duration in the lobby, but not otherwise", () => {
    const { clock } = makeClock();
    const inLobby = run(
      lobbyGame(),
      [{ type: "setDuration", playerId: "host", duration: 120 }],
      clock,
    );
    expect(inLobby.state.duration).toBe(120);
    const inWaiting = run(
      createGame(),
      [{ type: "setDuration", playerId: "host", duration: 120 }],
      clock,
    );
    expect(inWaiting.state.duration).toBe(60); // rejected: not in lobby
  });

  it("rejects a duration that is not one of the allowed values", () => {
    const { clock } = makeClock();
    const { state } = run(
      lobbyGame(),
      [{ type: "setDuration", playerId: "host", duration: 55 as unknown as Duration }],
      clock,
    );
    expect(state.duration).toBe(60);
  });

  it("picks the highest-Wertung player as the winner when the round ends", () => {
    const { clock, advance } = makeClock(0);
    const text = "a".repeat(20);
    const { state } = run(
      lobbyGame(),
      [
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "start", playerId: "host", text },
      ],
      clock,
    );
    // host types 10 correct, p2 types 5 correct + 5 errors.
    const events: GameEvent[] = [
      ...Array.from({ length: 10 }, () => ({
        type: "keystroke" as const,
        playerId: "host",
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
    ];
    const mid = run(state, events, clock);
    advance(60);
    const end = run(mid.state, [{ type: "tick" }], clock);
    expect(end.state.phase).toBe("results");
    expect(end.state.winnerId).toBe("host");
  });

  it("transitions results → waiting on endSession and rotates the Start-Recht", () => {
    const { clock, advance } = makeClock(0);
    const { state: lobby } = run(
      lobbyGame(),
      [
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "startSession", playerId: "host" },
      ],
      clock,
    );
    const started = run(lobby, [{ type: "start", playerId: "host", text: "ab" }], clock).state;
    advance(60);
    const results = run(started, [{ type: "tick" }], clock).state;
    expect(results.phase).toBe("results");
    const next = run(results, [{ type: "endSession", playerId: "p2" }], clock).state;
    expect(next.phase).toBe("waiting");
    expect(next.startRight).toBe("p2"); // rotated from host to the next player
    expect(next.players[0]).toMatchObject({ correct: 0, errors: 0, cursor: 0, lastTypedAt: null });
  });

  it("rejects endSession from a non-participant or outside the results phase", () => {
    const { clock } = makeClock();
    const { state } = run(lobbyGame(), [{ type: "endSession", playerId: "host" }], clock);
    expect(state.phase).toBe("lobby"); // not in results: rejected
  });

  it("transfers the host role to the next player when the host disconnects", () => {
    const { clock } = makeClock();
    const { state } = run(
      createGame(),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "disconnect", playerId: "p1" },
      ],
      clock,
    );
    expect(state.players.map((p) => p.isHost)).toEqual([true]); // p2 promoted to host
    expect(state.players[0].id).toBe("p2");
    expect(state.players[0].isHost).toBe(true);
  });

  it("passes the Start-Recht to the first remaining player when its holder leaves the lobby", () => {
    const { clock } = makeClock();
    const { state } = run(
      createGame(),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "startSession", playerId: "p1" },
        { type: "disconnect", playerId: "p1" },
      ],
      clock,
    );
    expect(state.startRight).toBe("p2");
  });

  it("keeps results phase if the last remaining player leaves in the results (defensive)", () => {
    const lonely: GameState = {
      ...createGame(),
      phase: "results",
      players: [
        {
          id: "p1",
          nickname: "Alice",
          isHost: false,
          correct: 1,
          errors: 0,
          cursor: 1,
          lastTypedAt: null,
        },
      ],
      startRight: "p1",
      winnerId: "p1",
    };
    const { clock } = makeClock();
    const { state } = run(lonely, [{ type: "disconnect", playerId: "p1" }], clock);
    expect(state.phase).toBe("results");
    expect(state.players).toHaveLength(0);
    expect(state.winnerId).toBeNull();
  });

  it("emits a snapshot on every accepted event and none on rejected ones", () => {
    const { clock } = makeClock();
    const join = step(createGame(), { type: "join", playerId: "p1", nickname: "Alice" }, clock);
    expect(join.snapshots).toHaveLength(1);
    const duplicate = step(
      join.newState,
      { type: "join", playerId: "p1", nickname: "Alice" },
      clock,
    );
    expect(duplicate.snapshots).toHaveLength(0);
    expect(duplicate.newState).toBe(join.newState); // same reference: nothing changed
  });

  it("orders players by Wertung descending in every round snapshot", () => {
    const { clock, advance } = makeClock(0);
    const text = "a".repeat(20);
    const { state } = run(
      lobbyGame(),
      [
        { type: "join", playerId: "p1", nickname: "Clean" },
        { type: "join", playerId: "p2", nickname: "Sloppy" },
        { type: "start", playerId: "host", text },
      ],
      clock,
    );
    // Advance time so elapsed > 0 when keystrokes are recorded.
    advance(10);
    const ticked = run(state, [{ type: "tick" }], clock).state; // timeRemaining = 50
    const events: GameEvent[] = [
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
    ];
    const { snapshots } = run(ticked, events, clock);
    const snap = last(snapshots);
    // p1: 10 correct, 0 errors, elapsed=10 → 100; p2: 12 correct, 6 errors, elapsed=10 → 53; host: 0
    expect(snap.players.map((p) => p.id)).toEqual(["p1", "p2", "host"]);
    expect(snap.players[0].wertung).toBeGreaterThan(snap.players[1].wertung);
  });

  it("rewards technique: slow+correct beats fast+inaccurate in the final results", () => {
    const { clock, advance } = makeClock(0);
    const text = "a".repeat(20);
    const { state } = run(
      lobbyGame(),
      [
        { type: "join", playerId: "p1", nickname: "Clean" },
        { type: "join", playerId: "p2", nickname: "Sloppy" },
        { type: "start", playerId: "host", text },
      ],
      clock,
    );
    const events: GameEvent[] = [
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
    ];
    const mid = run(state, events, clock);
    advance(60);
    const end = run(mid.state, [{ type: "tick" }], clock);
    const snap = last(end.snapshots);
    expect(snap.winnerId).toBe("p1");
    const p1 = snap.players.find((p) => p.id === "p1")!;
    const p2 = snap.players.find((p) => p.id === "p2")!;
    expect(p1.wertung).toBe(16);
    expect(p2.wertung).toBe(8);
    const host = snap.players.find((p) => p.id === "host")!;
    expect(host.wertung).toBe(0);
  });

  it("keeps a stable score for a player who has NOT finished across ticks", () => {
    const { clock, advance } = makeClock(0);
    const text = "a".repeat(20);
    const result = run(
      lobbyGame(),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text },
        ...Array.from({ length: 10 }, () => ({
          type: "keystroke" as const,
          playerId: "p1",
          key: "a",
        })),
      ],
      clock,
    );
    const scoreBefore = last(result.snapshots).players.find((p) => p.id === "p1")!.wertung;
    advance(10);
    const after = run(result.state, [{ type: "tick" }], clock);
    const scoreAfter = last(after.snapshots).players.find((p) => p.id === "p1")!.wertung;
    expect(scoreAfter).toBe(scoreBefore);
  });

  it("keeps a stable score for a finished player across ticks (regression)", () => {
    const { clock, advance } = makeClock(0);
    const text = "hallo";
    const { state } = run(
      lobbyGame(),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text },
      ],
      clock,
    );
    const finishEvents: GameEvent[] = [
      { type: "keystroke", playerId: "p1", key: "h" },
      { type: "keystroke", playerId: "p1", key: "a" },
      { type: "keystroke", playerId: "p1", key: "l" },
      { type: "keystroke", playerId: "p1", key: "l" },
      { type: "keystroke", playerId: "p1", key: "o" },
    ];
    const afterFinish = run(state, finishEvents, clock);
    const scoreAtFinish = last(afterFinish.snapshots).players.find((p) => p.id === "p1")!.wertung;
    advance(30);
    const afterTick = run(afterFinish.state, [{ type: "tick" }], clock);
    const scoreAfterTick = last(afterTick.snapshots).players.find((p) => p.id === "p1")!.wertung;
    expect(scoreAfterTick).toBe(scoreAtFinish);
  });
});
