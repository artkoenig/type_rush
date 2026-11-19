import { describe, expect, it } from "vitest";
import { GameServer, type ClientConnection } from "./server.js";
import type { Snapshot } from "../engine/engine.js";
import { RANGES, TEXTS } from "../content/textPool.js";

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

function makeClock(start = 0) {
  let now = start;
  return { clock: () => now, advance: (sec: number) => (now += sec) };
}

function setup() {
  const { clock, advance } = makeClock();
  const server = new GameServer({ clock, rng: () => 0 });
  return { server, advance };
}

function send(conn: FakeConn, server: GameServer, msg: unknown): void {
  server.message(conn, JSON.stringify(msg));
}

describe("host connection", () => {
  it("creates an empty waiting game for the first connection", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    expect(host.sent).toHaveLength(2); // hello + snapshot
    const snap = host.last();
    expect(snap.phase).toBe("waiting");
    expect(snap.players).toHaveLength(0);
  });

  it("greets every new connection with a hello message", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    expect(JSON.parse(host.sent[0])).toEqual({ type: "hello", playerId: "h", isHost: false });
    const p2 = new FakeConn("p2");
    server.connect(p2);
    expect(JSON.parse(p2.sent[0])).toEqual({ type: "hello", playerId: "p2", isHost: false });
  });

  it("sends the current state to each later connection", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    send(host, server, { type: "join", nickname: "Host" });
    const p2 = new FakeConn("p2");
    server.connect(p2);
    expect(p2.sent).toHaveLength(2);
    expect(p2.last().players.map((p) => p.id)).toEqual(["h"]);
  });
});

describe("join", () => {
  it("adds the player and broadcasts to all clients", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(host);
    server.connect(p2);
    send(host, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    expect(host.last().players.map((p) => p.nickname)).toEqual(["Host", "Bob"]);
    expect(p2.last().players.map((p) => p.nickname)).toEqual(["Host", "Bob"]);
    expect(host.last().players[0].isHost).toBe(true);
  });

  it("ignores invalid messages without broadcasting", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    server.message(host, "not json");
    server.message(host, JSON.stringify(42));
    server.message(host, JSON.stringify({ type: "nope" }));
    server.message(host, JSON.stringify({ type: "join" }));
    server.message(host, JSON.stringify({ type: "keystroke" }));
    server.message(host, "null");
    expect(host.sent).toHaveLength(2);
  });
});

describe("startSession", () => {
  it("moves the game from waiting to the lobby when the host triggers it", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    expect(host.last().phase).toBe("lobby");
  });

  it("rejects a startSession by a non-host", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(host);
    server.connect(p2);
    send(host, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(p2, server, { type: "startSession" });
    expect(host.last().phase).toBe("waiting");
  });
});

describe("start", () => {
  it("begins a round with a text calibrated to the duration", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    send(host, server, { type: "start" });
    const snap = host.last();
    expect(snap.phase).toBe("round");
    expect(TEXTS).toContain(snap.text);
    const [min, max] = RANGES[snap.duration];
    expect(snap.text.length).toBeGreaterThanOrEqual(min);
    expect(snap.text.length).toBeLessThanOrEqual(max);
    expect(snap.timeRemaining).toBe(60);
  });

  it("rejects a start by a non-host", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(host);
    server.connect(p2);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(p2, server, { type: "start" });
    expect(host.last().phase).toBe("lobby");
    expect(host.sent).toHaveLength(5); // hello+snap, join, startSession, p2 join; start rejected
  });
});

describe("keystroke", () => {
  it("counts a correct key and advances the cursor", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    send(host, server, { type: "start" });
    const key = host.last().text[0];
    send(host, server, { type: "keystroke", key });
    const player = host.last().players[0];
    expect(player.correct).toBe(1);
    expect(player.cursor).toBe(1);
  });

  it("counts a wrong key as error without advancing the cursor", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    send(host, server, { type: "start" });
    const key = host.last().text[0] === "a" ? "b" : "a";
    send(host, server, { type: "keystroke", key });
    const player = host.last().players[0];
    expect(player.errors).toBe(1);
    expect(player.cursor).toBe(0);
  });
});

describe("tick", () => {
  it("advances the round timer", () => {
    const { server, advance } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    send(host, server, { type: "start" });
    advance(10);
    server.tick();
    expect(host.last().timeRemaining).toBe(50);
  });

  it("ends the round when time runs out", () => {
    const { server, advance } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    send(host, server, { type: "start" });
    send(host, server, { type: "keystroke", key: host.last().text[0] });
    advance(60);
    server.tick();
    const snap = host.last();
    expect(snap.phase).toBe("results");
    expect(snap.winnerId).toBe("h");
  });
});

describe("disconnect", () => {
  it("promotes the next player to host when the host leaves", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(host);
    server.connect(p2);
    send(host, server, { type: "join", nickname: "Host" });
    send(p2, server, { type: "join", nickname: "Bob" });
    server.disconnect(host);
    const snap = p2.last();
    expect(snap.phase).toBe("waiting");
    expect(snap.players.map((p) => p.id)).toEqual(["p2"]);
    expect(snap.players[0].isHost).toBe(true);
    expect(snap.startRight).toBe("p2");
  });

  it("removes a non-host from the round, which continues", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(host);
    server.connect(p2);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(host, server, { type: "start" });
    server.disconnect(p2);
    const snap = host.last();
    expect(snap.phase).toBe("round");
    expect(snap.players.map((p) => p.id)).toEqual(["h"]);
  });

  it("ignores the disconnect of a connection that never joined", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    const p3 = new FakeConn("p3");
    server.connect(host);
    server.connect(p3);
    server.disconnect(p3);
    expect(host.sent).toHaveLength(2);
  });
});

describe("setDuration", () => {
  it("lets the host change the duration in the lobby", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    send(host, server, { type: "setDuration", duration: 30 });
    expect(host.last().duration).toBe(30);
  });

  it("ignores a duration change by a non-host", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(host);
    server.connect(p2);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(p2, server, { type: "setDuration", duration: 30 });
    expect(host.last().duration).toBe(60);
  });

  it("ignores an invalid duration", () => {
    const { server } = setup();
    const host = new FakeConn("h");
    server.connect(host);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    server.message(host, JSON.stringify({ type: "setDuration", duration: 45 }));
    expect(host.sent).toHaveLength(4); // hello+snap, join, startSession; invalid → no broadcast
  });
});

describe("endSession", () => {
  it("returns to the waiting phase and rotates the start right", () => {
    const { server, advance } = setup();
    const host = new FakeConn("h");
    const p2 = new FakeConn("p2");
    server.connect(host);
    server.connect(p2);
    send(host, server, { type: "join", nickname: "Host" });
    send(host, server, { type: "startSession" });
    send(p2, server, { type: "join", nickname: "Bob" });
    send(host, server, { type: "start" });
    advance(60);
    server.tick();
    send(host, server, { type: "endSession" });
    const snap = host.last();
    expect(snap.phase).toBe("waiting");
    expect(snap.startRight).toBe("p2");
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
    const host = new FakeConn("h");
    const p2 = new FakeConn("p2");
    const p3 = new FakeConn("p3");
    server.connect(host);
    server.connect(p2);
    server.connect(p3);
    send(host, server, { type: "join", nickname: "Host" });
    send(p3, server, { type: "join", nickname: "C" });
    expect(host.last()).toEqual(p2.last());
    expect(host.last()).toEqual(p3.last());
    expect(host.last().players.map((p) => p.nickname)).toEqual(["Host", "C"]);
  });
});
