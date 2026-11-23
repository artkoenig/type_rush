import { describe, expect, it } from "vitest";
import { GameServer, type ClientConnection } from "./server.js";
import type { Snapshot } from "../engine/engine.js";
import { COUNTDOWN_DURATION, ROUND_DURATION } from "../engine/engine.js";
import { TEXTS } from "../content/textPool.js";

class FakeConn implements ClientConnection {
  sent: string[] = [];
  constructor(readonly id: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  last(): Snapshot {
    return JSON.parse(this.sent[this.sent.length - 1]) as Snapshot;
  }
}

function setup() {
  const server = new GameServer({ rng: () => 0 });
  return { server };
}

function send(conn: FakeConn, server: GameServer, msg: unknown): void {
  server.message(conn, JSON.stringify(msg));
}

/** Applies `n` server ticks. Time is modeled by the tick count, so no clock is needed. */
function tickN(server: GameServer, n: number): void {
  for (let i = 0; i < n; i++) {
    server.tick();
  }
}

describe("connection", () => {
  it("creates an empty lobby for the first connection", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    server.connect(first);
    expect(first.sent).toHaveLength(2); // hello + snapshot
    const snap = first.last();
    expect(snap.phase).toBe("lobby");
    expect(snap.players).toHaveLength(0);
    expect(snap.spectatorsCount).toBe(0);
  });

  it("greets every new connection with a hello message", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    server.connect(first);
    expect(JSON.parse(first.sent[0])).toEqual({ type: "hello", playerId: "h" });
    const p2 = new FakeConn("p2");
    server.connect(p2);
    expect(JSON.parse(p2.sent[0])).toEqual({ type: "hello", playerId: "p2" });
  });

  it("sends the current state to each later connection", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    server.connect(first);
    send(first, server, { type: "join", nickname: "Host" });
    const p2 = new FakeConn("p2");
    server.connect(p2);
    expect(p2.sent).toHaveLength(2);
    expect(p2.last().spectatorsCount).toBe(1);
  });
});

describe("join", () => {
  it("adds a spectator and broadcasts to all clients", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    expect(first.last().spectatorsCount).toBe(2);
    expect(p2.last().spectatorsCount).toBe(2);
  });

  it("ignores invalid messages without broadcasting", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    server.connect(first);
    server.message(first, "not json");
    server.message(first, JSON.stringify(42));
    server.message(first, JSON.stringify({ type: "nope" }));
    server.message(first, JSON.stringify({ type: "join" }));
    server.message(first, JSON.stringify({ type: "keystroke" }));
    server.message(first, "null");
    expect(first.sent).toHaveLength(2);
  });
});

describe("signUp", () => {
  it("moves a spectator into the roster", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(first, server, { type: "signUp" });
    const snap = first.last();
    expect(snap.players.map((p) => p.id)).toEqual(["h"]);
    expect(snap.spectatorsCount).toBe(1);
  });

  it("rejects a signUp from someone who is not a spectator", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    server.connect(first);
    // never joined: not a spectator
    send(first, server, { type: "signUp" });
    expect(first.sent).toHaveLength(2); // no broadcast
  });
});

describe("auto-start", () => {
  it("starts the countdown after the 30s lobby timer with 2+ players", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(first, server, { type: "signUp" });
    send(p2, server, { type: "signUp" });
    tickN(server, 30);
    expect(first.last().phase).toBe("countdown");
    tickN(server, COUNTDOWN_DURATION);
    expect(first.last().phase).toBe("round");
  });

  it("starts a round with a text from the pool", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(first, server, { type: "signUp" });
    send(p2, server, { type: "signUp" });
    tickN(server, 30);
    tickN(server, COUNTDOWN_DURATION);
    const snap = first.last();
    expect(snap.phase).toBe("round");
    expect(TEXTS).toContain(snap.text);
    expect(snap.timeRemaining).toBe(ROUND_DURATION);
  });
});

describe("keystroke", () => {
  it("counts a correct key and advances the cursor", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(first, server, { type: "signUp" });
    send(p2, server, { type: "signUp" });
    tickN(server, 30);
    tickN(server, COUNTDOWN_DURATION);
    const key = first.last().text[0];
    send(first, server, { type: "keystroke", key });
    const player = first.last().players[0];
    expect(player.correct).toBe(1);
    expect(player.cursor).toBe(1);
  });

  it("counts a wrong key as error without advancing the cursor", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(first, server, { type: "signUp" });
    send(p2, server, { type: "signUp" });
    tickN(server, 30);
    tickN(server, COUNTDOWN_DURATION);
    const key = first.last().text[0] === "a" ? "b" : "a";
    send(first, server, { type: "keystroke", key });
    const player = first.last().players[0];
    expect(player.errors).toBe(1);
    expect(player.cursor).toBe(0);
  });
});

describe("tick", () => {
  it("advances the round timer", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(first, server, { type: "signUp" });
    send(p2, server, { type: "signUp" });
    tickN(server, 30);
    tickN(server, COUNTDOWN_DURATION);
    tickN(server, 10);
    expect(first.last().timeRemaining).toBe(ROUND_DURATION - 10);
  });

  it("ends the round when time runs out and picks the winner", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(first, server, { type: "signUp" });
    send(p2, server, { type: "signUp" });
    tickN(server, 30);
    tickN(server, COUNTDOWN_DURATION);
    send(first, server, { type: "keystroke", key: first.last().text[0] });
    tickN(server, 60);
    const snap = first.last();
    expect(snap.phase).toBe("lobby");
    expect(snap.winnerId).toBe("h");
    expect(snap.players).toHaveLength(0);
    expect(snap.lastRoundResults).toHaveLength(2);
  });

  it("ends the round directly in the lobby", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(first, server, { type: "signUp" });
    send(p2, server, { type: "signUp" });
    tickN(server, 30);
    tickN(server, COUNTDOWN_DURATION);
    tickN(server, 60); // → lobby (round ends directly in the lobby)
    const snap = first.last();
    expect(snap.phase).toBe("lobby");
    expect(snap.players).toHaveLength(0);
    expect(snap.spectatorsCount).toBe(2);
    expect(snap.lastRoundResults.length).toBeGreaterThan(0);
  });
});

describe("disconnect", () => {
  it("removes a spectator from the lobby", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    server.disconnect(p2);
    const snap = first.last();
    expect(snap.phase).toBe("lobby");
    expect(snap.spectatorsCount).toBe(1);
  });

  it("removes a player from the round, which continues", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(first);
    server.connect(p2);
    send(first, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(first, server, { type: "signUp" });
    send(p2, server, { type: "signUp" });
    tickN(server, 30);
    tickN(server, COUNTDOWN_DURATION);
    server.disconnect(p2);
    const snap = first.last();
    expect(snap.phase).toBe("round");
    expect(snap.players.map((p) => p.id)).toEqual(["h"]);
  });

  it("ignores the disconnect of a connection that never joined", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p3 = new FakeConn("p3");
    server.connect(first);
    server.connect(p3);
    server.disconnect(p3);
    expect(first.sent).toHaveLength(2);
  });
});

describe("snapshot", () => {
  it("returns the current snapshot once a game exists", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    server.connect(first);
    send(first, server, { type: "join", nickname: "Host" });
    expect(server.snapshot()?.phase).toBe("lobby");
    expect(server.snapshot()?.spectatorsCount).toBe(1);
  });
});

describe("before any connection", () => {
  it("returns a null snapshot and ignores messages, ticks and disconnects", () => {
    const server = new GameServer();
    expect(server.snapshot()).toBeNull();
    const ghost = new FakeConn("g");
    server.message(ghost, JSON.stringify({ type: "join", nickname: "X" }));
    server.tick();
    server.disconnect(ghost);
    expect(ghost.sent).toHaveLength(0);
  });
});

describe("broadcast", () => {
  it("sends the same snapshot to all connected clients", () => {
    const { server } = setup();
    const first = new FakeConn("h");
    const p2 = new FakeConn("p2");
    const p3 = new FakeConn("p3");
    server.connect(first);
    server.connect(p2);
    server.connect(p3);
    send(first, server, { type: "join", nickname: "Host" });
    send(p3, server, { type: "join", nickname: "C" });
    expect(first.last()).toEqual(p2.last());
    expect(first.last()).toEqual(p3.last());
    expect(first.last().spectatorsCount).toBe(2);
  });
});
