import { describe, expect, it } from "vitest";
import {
  createGame,
  step,
  wertung,
  type Clock,
  type GameEvent,
  type GameState,
  type Snapshot,
} from "./engine";

/** Deterministic fake clock in seconds. */
function makeClock(start = 0) {
  let t = start;
  const clock: Clock = () => t;
  return { clock, advance: (dt: number) => (t += dt) };
}

/** Feeds a sequence of events; collects the emitted snapshots (external behavior only). */
/** @param clock Defaults to a frozen clock; lobby-only tests do not need time to pass. */
function run(state: GameState, events: GameEvent[], clock: Clock = () => 0) {
  let current = state;
  const snapshots: Snapshot[] = [];
  for (const event of events) {
    const result = step(current, event, clock);
    current = result.newState;
    snapshots.push(...result.snapshots);
  }
  return { state: current, snapshots };
}

const last = (snapshots: Snapshot[]) => snapshots[snapshots.length - 1];

describe("createGame", () => {
  it("auto-joins the host with the default nickname and Start-Recht", () => {
    const game = createGame("host");
    expect(game.phase).toBe("lobby");
    expect(game.players).toEqual([
      {
        id: "host",
        nickname: "Host",
        isHost: true,
        correct: 0,
        errors: 0,
        cursor: 0,
        finishedAt: null,
      },
    ]);
    expect(game.startRight).toBe("host");
    expect(game.duration).toBe(60);
  });
});

describe("join", () => {
  it("adds a player with a nickname in join order", () => {
    const { snapshots } = run(createGame("host"), [
      { type: "join", playerId: "p1", nickname: "Alice" },
    ]);
    const snap = last(snapshots);
    expect(snap.players.map((p) => p.nickname)).toEqual(["Host", "Alice"]);
    expect(snap.players[1].id).toBe("p1");
  });

  it("rejects a double join", () => {
    const { state, snapshots } = run(createGame("host"), [
      { type: "join", playerId: "p1", nickname: "Alice" },
      { type: "join", playerId: "p1", nickname: "Alice" },
    ]);
    expect(state.players).toHaveLength(2);
    expect(snapshots).toHaveLength(1); // second join rejected → no snapshot
  });

  it("rejects a ninth player (max 8)", () => {
    const events: GameEvent[] = Array.from({ length: 8 }, (_, i) => ({
      type: "join" as const,
      playerId: `p${i}`,
      nickname: `P${i}`,
    }));
    const { state, snapshots } = run(createGame("host"), events);
    expect(state.players).toHaveLength(8); // host + 7
    expect(snapshots).toHaveLength(7);
  });

  it("keeps the earliest joiner's Start-Recht", () => {
    const { state } = run(createGame("host"), [
      { type: "join", playerId: "p1", nickname: "Alice" },
      { type: "join", playerId: "p2", nickname: "Bob" },
    ]);
    expect(state.startRight).toBe("host");
  });

  it("rejects joining during a round", () => {
    const { clock } = makeClock();
    const { state, snapshots } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
        { type: "join", playerId: "p2", nickname: "Bob" },
      ],
      clock,
    );
    expect(state.players).toHaveLength(2);
    expect(snapshots).toHaveLength(2); // join + start accepted, second join rejected
  });
});

describe("round start", () => {
  it("starts immediately without countdown when the Start-Recht holder triggers it", () => {
    const { clock, advance } = makeClock(100);
    const { state, snapshots } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
      ],
      clock,
    );
    expect(state.phase).toBe("round");
    expect(state.timeRemaining).toBe(60);
    expect(last(snapshots).phase).toBe("round");
    expect(last(snapshots).text).toBe("hallo");
    advance(10);
    const { snapshots: ticks } = run(state, [{ type: "tick" }], clock);
    expect(last(ticks).timeRemaining).toBe(50);
  });

  it("gives every player the same text", () => {
    const { clock } = makeClock();
    const { snapshots } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "start", playerId: "host", text: "hallo welt" },
      ],
      clock,
    );
    expect(last(snapshots).text).toBe("hallo welt");
    expect(last(snapshots).players).toHaveLength(3);
  });

  it("allows a solo start (1 player)", () => {
    const { clock } = makeClock();
    const { state } = run(
      createGame("host"),
      [{ type: "start", playerId: "host", text: "hallo" }],
      clock,
    );
    expect(state.phase).toBe("round");
    expect(state.players).toHaveLength(1);
  });

  it("rejects a start by a non-holder", () => {
    const { clock } = makeClock();
    const { state, snapshots } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "p1", text: "hallo" },
      ],
      clock,
    );
    expect(state.phase).toBe("lobby");
    expect(snapshots).toHaveLength(1);
  });
});

describe("keystroke handling (ADR 0003)", () => {
  function roundState() {
    const { clock } = makeClock();
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
      ],
      clock,
    );
    return { state, clock };
  }

  it("advances the cursor on a correct key", () => {
    const { state, clock } = roundState();
    const { snapshots } = run(state, [{ type: "keystroke", playerId: "p1", key: "h" }], clock);
    const p = last(snapshots).players.find((x) => x.id === "p1")!;
    expect(p.cursor).toBe(1);
    expect(p.correct).toBe(1);
    expect(p.errors).toBe(0);
  });

  it("does not advance the cursor on a wrong key and counts it as an error", () => {
    const { state, clock } = roundState();
    const { snapshots } = run(state, [{ type: "keystroke", playerId: "p1", key: "x" }], clock);
    const p = last(snapshots).players.find((x) => x.id === "p1")!;
    expect(p.cursor).toBe(0);
    expect(p.errors).toBe(1);
  });

  it("counts every wrong press as an error", () => {
    const { state, clock } = roundState();
    const { snapshots } = run(
      state,
      [
        { type: "keystroke", playerId: "p1", key: "x" },
        { type: "keystroke", playerId: "p1", key: "y" },
        { type: "keystroke", playerId: "p1", key: "h" },
      ],
      clock,
    );
    const p = last(snapshots).players.find((x) => x.id === "p1")!;
    expect(p.errors).toBe(2);
    expect(p.correct).toBe(1);
    expect(p.cursor).toBe(1);
  });

  it("ignores keys after the text is finished", () => {
    const { state, clock } = roundState();
    const { snapshots } = run(
      state,
      [
        { type: "keystroke", playerId: "p1", key: "h" },
        { type: "keystroke", playerId: "p1", key: "a" },
        { type: "keystroke", playerId: "p1", key: "l" },
        { type: "keystroke", playerId: "p1", key: "l" },
        { type: "keystroke", playerId: "p1", key: "o" },
        { type: "keystroke", playerId: "p1", key: "x" }, // after finish → ignored
      ],
      clock,
    );
    const p = last(snapshots).players.find((x) => x.id === "p1")!;
    expect(p.cursor).toBe(5);
    expect(p.correct).toBe(5);
    expect(p.errors).toBe(0);
  });

  it("ignores keystrokes outside a round", () => {
    const { clock } = makeClock();
    const { state, snapshots } = run(
      createGame("host"),
      [{ type: "keystroke", playerId: "host", key: "h" }],
      clock,
    );
    expect(snapshots).toHaveLength(0);
    expect(state.players[0].cursor).toBe(0);
  });

  it("ignores keys that are not a single character", () => {
    const { state, clock } = roundState();
    const { state: after, snapshots } = run(
      state,
      [{ type: "keystroke", playerId: "p1", key: "ab" }],
      clock,
    );
    expect(snapshots).toHaveLength(0);
    expect(after).toBe(state);
  });

  it("ignores keystrokes from an unknown player", () => {
    const { state, clock } = roundState();
    const { state: after, snapshots } = run(
      state,
      [{ type: "keystroke", playerId: "ghost", key: "h" }],
      clock,
    );
    expect(snapshots).toHaveLength(0);
    expect(after).toBe(state);
  });
});

describe("timer", () => {
  it("advances on tick and ends the round when timeRemaining reaches 0", () => {
    const { clock, advance } = makeClock(0);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
      ],
      clock,
    );
    advance(30);
    const mid = run(state, [{ type: "tick" }], clock);
    expect(mid.state.phase).toBe("round");
    expect(mid.state.timeRemaining).toBe(30);
    advance(30);
    const end = run(mid.state, [{ type: "tick" }], clock);
    expect(end.state.phase).toBe("results");
    expect(end.state.timeRemaining).toBe(0);
    expect(last(end.snapshots).phase).toBe("results");
  });

  it("ignores ticks outside a round", () => {
    const { clock, advance } = makeClock();
    const { state, snapshots } = run(createGame("host"), [{ type: "tick" }], clock);
    expect(snapshots).toHaveLength(0);
    advance(5);
    const again = run(state, [{ type: "tick" }], clock);
    expect(again.snapshots).toHaveLength(0);
  });
});

describe("Wertung", () => {
  it("computes 100·correct³/(total²·durationSec) with integer arithmetic", () => {
    expect(wertung(10, 0, 60)).toBe(16); // spec example: 16
    expect(wertung(12, 6, 60)).toBe(8); // spec example: 8
  });

  it("is 0 if no keypresses", () => {
    expect(wertung(0, 0, 60)).toBe(0);
  });

  it("rewards technique: slow+correct beats fast+inaccurate in the final results", () => {
    const { clock, advance } = makeClock(0);
    const text = "a".repeat(20);
    const { state } = run(
      createGame("host"),
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
  });

  it("is 0 for a player who never typed", () => {
    const { clock, advance } = makeClock(0);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
        { type: "keystroke", playerId: "p1", key: "h" },
      ],
      clock,
    );
    advance(60);
    const end = run(state, [{ type: "tick" }], clock);
    const snap = last(end.snapshots);
    const host = snap.players.find((p) => p.id === "host")!;
    expect(host.wertung).toBe(0);
    expect(snap.winnerId).toBe("p1");
  });

  it("keeps a stable score for a finished player across ticks (regression)", () => {
    const { clock, advance } = makeClock(0);
    const text = "hallo";
    const { state } = run(
      createGame("host"),
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

describe("leaderboard", () => {
  it("orders players by Wertung descending in every round snapshot", () => {
    const { clock } = makeClock(0);
    const text = "a".repeat(20);
    const { state } = run(
      createGame("host"),
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
    const { snapshots } = run(state, events, clock);
    const snap = last(snapshots);
    expect(snap.players.map((p) => p.id)).toEqual(["p1", "p2", "host"]); // 16 > 8 > 0
    expect(snap.players[0].wertung).toBeGreaterThan(snap.players[1].wertung);
  });

  it("keeps join order in the lobby", () => {
    const { snapshots } = run(createGame("host"), [
      { type: "join", playerId: "p1", nickname: "Alice" },
      { type: "join", playerId: "p2", nickname: "Bob" },
    ]);
    expect(last(snapshots).players.map((p) => p.id)).toEqual(["host", "p1", "p2"]);
  });
});

describe("disconnect", () => {
  it("removes a player from the round and the leaderboard", () => {
    const { clock, advance } = makeClock(0);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "start", playerId: "host", text: "hallo" },
        { type: "keystroke", playerId: "p1", key: "h" },
        { type: "disconnect", playerId: "p1" },
      ],
      clock,
    );
    const snap = last(run(state, [{ type: "tick" }], clock).snapshots);
    expect(snap.players.map((p) => p.id)).toEqual(["host", "p2"]);
    expect(snap.phase).toBe("round");
    advance(60);
    const end = run(state, [{ type: "tick" }], clock);
    expect(end.state.phase).toBe("results");
    expect(end.state.players.map((p) => p.id)).toEqual(["host", "p2"]);
  });

  it("runs the round to completion if the last non-host player leaves mid-round", () => {
    const { clock, advance } = makeClock(0);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
        { type: "disconnect", playerId: "p1" },
      ],
      clock,
    );
    expect(state.phase).toBe("round"); // round continues
    advance(60);
    const end = run(state, [{ type: "tick" }], clock);
    expect(end.state.phase).toBe("results"); // host is always in the round → results
    expect(end.state.players.map((p) => p.id)).toEqual(["host"]);
  });

  it("transitions to results if the round finishes with empty players (defensive)", () => {
    const { clock, advance } = makeClock(0);
    // Unreachable through normal play (host always plays); tested as a pure function.
    const empty: GameState = {
      ...createGame("host"),
      phase: "round",
      players: [],
      startRight: null,
      text: "hallo",
      timeRemaining: 60,
      clockAtRoundStart: 0,
    };
    advance(60);
    const end = run(empty, [{ type: "tick" }], clock);
    expect(end.state.phase).toBe("results");
    expect(end.state.winnerId).toBeNull();
    expect(last(end.snapshots).phase).toBe("results");
  });

  it("removes the host when they leave during a round; the round continues", () => {
    const { clock } = makeClock(0);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
        { type: "disconnect", playerId: "host" },
      ],
      clock,
    );
    expect(state.phase).toBe("round");
    expect(state.players).toHaveLength(1);
  });

  it("hands over the Start-Recht to the next in queue when the holder leaves the lobby", () => {
    const { state } = run(createGame("host"), [
      { type: "join", playerId: "p1", nickname: "Alice" },
      { type: "join", playerId: "p2", nickname: "Bob" },
      { type: "disconnect", playerId: "host" }, // host is first in queue → p1 inherits
    ]);
    expect(state.phase).toBe("lobby");
    expect(state.startRight).toBe("p1");
  });

  it("hands over the Start-Recht to the head of the queue when a rotated holder leaves the lobby", () => {
    const { clock, advance } = makeClock(0);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "start", playerId: "host", text: "hallo" },
      ],
      clock,
    );
    advance(60);
    const results = run(state, [{ type: "tick" }], clock);
    const lobby = run(results.state, [{ type: "backToLobby", playerId: "host" }], clock);
    expect(lobby.state.startRight).toBe("p1"); // rotated after the round
    const after = run(lobby.state, [{ type: "disconnect", playerId: "p1" }], clock);
    expect(after.state.startRight).toBe("host"); // head of the remaining queue
    expect(after.state.players.map((x) => x.id)).toEqual(["host", "p2"]);
  });

  it("keeps the Start-Recht when a non-holder leaves the lobby", () => {
    const { clock, advance } = makeClock(0);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "start", playerId: "host", text: "hallo" },
      ],
      clock,
    );
    advance(60);
    const results = run(state, [{ type: "tick" }], clock);
    const lobby = run(results.state, [{ type: "backToLobby", playerId: "host" }], clock);
    expect(lobby.state.startRight).toBe("p1");
    const after = run(lobby.state, [{ type: "disconnect", playerId: "p2" }], clock);
    expect(after.state.startRight).toBe("p1");
  });

  it("recomputes the winner if the leader disconnects in the results", () => {
    const { clock, advance } = makeClock(0);
    const text = "a".repeat(20);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Clean" },
        { type: "join", playerId: "p2", nickname: "Sloppy" },
        { type: "start", playerId: "host", text },
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
      ],
      clock,
    );
    advance(60);
    const results = run(state, [{ type: "tick" }], clock);
    expect(results.state.winnerId).toBe("p1");
    const after = run(results.state, [{ type: "disconnect", playerId: "p1" }], clock);
    expect(after.state.winnerId).toBe("p2");
    expect(last(after.snapshots).players.map((p) => p.id)).toEqual(["p2", "host"]);
  });

  it("ignores a disconnect of an unknown player", () => {
    const { clock } = makeClock();
    const { state, snapshots } = run(
      createGame("host"),
      [{ type: "disconnect", playerId: "ghost" }],
      clock,
    );
    expect(snapshots).toHaveLength(0);
    expect(state.players).toHaveLength(1);
  });

  it("keeps results phase if the last remaining player leaves in the results (defensive)", () => {
    const { clock } = makeClock(0);
    // Unreachable through normal play; tested as a pure function.
    const lonely: GameState = {
      ...createGame("host"),
      phase: "results",
      players: [
        {
          id: "p1",
          nickname: "Alice",
          isHost: false,
          correct: 1,
          errors: 0,
          cursor: 1,
          finishedAt: null,
        },
      ],
      startRight: null,
      text: "hallo",
      timeRemaining: 0,
      clockAtRoundStart: 0,
      winnerId: "p1",
    };
    const after = run(lonely, [{ type: "disconnect", playerId: "p1" }], clock);
    expect(after.state.phase).toBe("results");
    expect(after.state.winnerId).toBeNull();
    expect(last(after.snapshots).phase).toBe("results");
  });

  it("sets startRight to null when the sole player (holding startRight) disconnects from the lobby", () => {
    const { clock } = makeClock(0);
    const { state } = run(createGame("host"), [{ type: "disconnect", playerId: "host" }], clock);
    expect(state.players).toEqual([]);
    expect(state.startRight).toBeNull();
  });
});

describe("back to lobby and Start-Recht rotation", () => {
  it("returns all remaining players to the lobby and rotates the Start-Recht", () => {
    const { clock, advance } = makeClock(0);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
        { type: "start", playerId: "host", text: "hallo" },
      ],
      clock,
    );
    advance(60);
    const results = run(state, [{ type: "tick" }], clock);
    const back = run(results.state, [{ type: "backToLobby", playerId: "host" }], clock);
    expect(back.state.phase).toBe("lobby");
    expect(back.state.players).toHaveLength(3);
    expect(back.state.startRight).toBe("p1"); // rotated from host to next in join order
    expect(back.state.text).toBe("");
    expect(back.state.winnerId).toBeNull();
    expect(last(back.snapshots).phase).toBe("lobby");
  });

  it("rotates cyclically after each round", () => {
    const { clock, advance } = makeClock(0);
    let state = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "join", playerId: "p2", nickname: "Bob" },
      ],
      clock,
    ).state;
    const playRound = (starter: string) => {
      state = run(state, [{ type: "start", playerId: starter, text: "hallo" }], clock).state;
      advance(60);
      state = run(state, [{ type: "tick" }], clock).state;
      state = run(state, [{ type: "backToLobby", playerId: "host" }], clock).state;
    };
    playRound("host");
    expect(state.startRight).toBe("p1");
    playRound("p1");
    expect(state.startRight).toBe("p2");
    playRound("p2");
    expect(state.startRight).toBe("host"); // cyclic
  });

  it("gives the Start-Recht to the first remaining player if the holder left during the results", () => {
    const { clock, advance } = makeClock(0);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
      ],
      clock,
    );
    advance(60);
    const results = run(state, [{ type: "tick" }], clock);
    expect(results.state.startRight).toBe("host");
    const after = run(results.state, [{ type: "disconnect", playerId: "host" }], clock);
    expect(after.state.phase).toBe("results");
  });

  it("rejects backToLobby outside the results phase", () => {
    const { clock } = makeClock();
    const { state, snapshots } = run(
      createGame("host"),
      [{ type: "backToLobby", playerId: "host" }],
      clock,
    );
    expect(state.phase).toBe("lobby");
    expect(snapshots).toHaveLength(0);
  });

  it("rejects backToLobby from an unknown player", () => {
    const { clock, advance } = makeClock(0);
    const { state } = run(
      createGame("host"),
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
      ],
      clock,
    );
    advance(60);
    const results = run(state, [{ type: "tick" }], clock);
    const { state: after, snapshots } = run(
      results.state,
      [{ type: "backToLobby", playerId: "ghost" }],
      clock,
    );
    expect(after).toBe(results.state);
    expect(snapshots).toHaveLength(0);
  });
});

describe("duration", () => {
  it("defaults to 60s and can be changed by the host in the lobby", () => {
    const { snapshots } = run(createGame("host"), [
      { type: "setDuration", playerId: "host", duration: 30 },
    ]);
    expect(last(snapshots).duration).toBe(30);
  });

  it("rejects a duration change by a non-host", () => {
    const { state, snapshots } = run(createGame("host"), [
      { type: "join", playerId: "p1", nickname: "Alice" },
      { type: "setDuration", playerId: "p1", duration: 30 },
    ]);
    expect(state.duration).toBe(60);
    expect(snapshots).toHaveLength(1);
  });

  it("rejects a duration outside 30/60/120", () => {
    const { state } = run(createGame("host"), [
      { type: "setDuration", playerId: "host", duration: 45 as 30 | 60 | 120 },
    ]);
    expect(state.duration).toBe(60);
  });

  it("rejects a duration change during a round", () => {
    const { clock } = makeClock();
    const { state } = run(
      createGame("host"),
      [
        { type: "start", playerId: "host", text: "hallo" },
        { type: "setDuration", playerId: "host", duration: 30 },
      ],
      clock,
    );
    expect(state.duration).toBe(60);
  });
});

describe("purity", () => {
  it("never mutates the input state", () => {
    const { clock } = makeClock(0);
    const game = createGame("host");
    const before = JSON.stringify(game);
    run(
      game,
      [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
        { type: "keystroke", playerId: "p1", key: "h" },
        { type: "keystroke", playerId: "p1", key: "x" },
        { type: "disconnect", playerId: "p1" },
      ],
      clock,
    );
    expect(JSON.stringify(game)).toBe(before);
  });

  it("is deterministic: identical inputs yield identical snapshots", () => {
    const make = () => {
      const { clock } = makeClock(0);
      const events: GameEvent[] = [
        { type: "join", playerId: "p1", nickname: "Alice" },
        { type: "start", playerId: "host", text: "hallo" },
        { type: "keystroke", playerId: "p1", key: "h" },
        { type: "keystroke", playerId: "p1", key: "a" },
        { type: "tick" },
      ];
      return { ...run(createGame("host"), events, clock), clock };
    };
    const a = make();
    const b = make();
    expect(a.snapshots).toEqual(b.snapshots);
    expect(a.state).toEqual(b.state);
  });
});
