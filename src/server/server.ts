import {
  createGame,
  step,
  toSnapshot,
  type GameEvent,
  type GameState,
  type Snapshot,
} from "../engine/engine.js";

/** Minimal transport a player session talks to (one per WebSocket connection). */
export interface ClientConnection {
  readonly id: string;
  send(data: string): void;
}

/**
 * Messages a client may send; the playerId is derived from the connection.
 * There is no host and no manual start: the game auto-starts (engine rules).
 */
export type ClientMessage =
  { type: "join"; nickname: string } | { type: "signUp" } | { type: "keystroke"; key: string };

export interface GameServerOptions {
  /** RNG for text selection. Defaults to Math.random. */
  rng?: () => number;
}

/**
 * Bridges WebSocket connections to the pure game engine: parses client
 * messages, forwards them as engine events, and broadcasts snapshots.
 * Every connection joins via the nickname dialog as a spectator; players
 * sign up for the next round and the game auto-starts on its own.
 */
export class GameServer {
  private state: GameState | null = null;
  private conns = new Map<string, ClientConnection>();
  private rng: () => number;

  constructor(options: GameServerOptions = {}) {
    this.rng = options.rng ?? Math.random;
  }

  /** A new connection. The first one creates the game; nobody auto-joins. */
  connect(conn: ClientConnection): void {
    this.conns.set(conn.id, conn);
    if (this.state === null) {
      this.state = createGame();
      conn.send(JSON.stringify({ type: "hello", playerId: conn.id }));
      this.broadcast(this.state);
      return;
    }
    const state = this.state;
    conn.send(JSON.stringify({ type: "hello", playerId: conn.id }));
    conn.send(JSON.stringify(toSnapshot(state)));
  }

  /** A client sent a raw (JSON) message. */
  message(conn: ClientConnection, raw: string): void {
    if (this.state === null) return;
    const msg = parseMessage(raw);
    if (msg === null) return;
    this.apply(this.state, toEvent(conn.id, msg));
  }

  /** A client disconnected. */
  disconnect(conn: ClientConnection): void {
    this.conns.delete(conn.id);
    if (this.state === null) return;
    this.apply(this.state, { type: "disconnect", playerId: conn.id });
  }

  /** Advance the engine by one second (driven by a 1s interval in the host process). */
  tick(): void {
    if (this.state === null) return;
    this.apply(this.state, { type: "tick" });
  }

  /** Current snapshot, or null before the first client connected. */
  snapshot(): Snapshot | null {
    return this.state === null ? null : toSnapshot(this.state);
  }

  /** Applies an engine event. Callers only invoke this with a live game. */
  private apply(state: GameState, event: GameEvent): void {
    const result = step(state, event, this.rng);
    this.state = result.newState;
    if (result.snapshots.length > 0) this.broadcast(result.newState);
  }

  /** Sends the current snapshot to every connected client. */
  private broadcast(state: GameState): void {
    const data = JSON.stringify(toSnapshot(state));
    for (const conn of this.conns.values()) conn.send(data);
  }
}

/** Parses and validates a raw client message; null if not a valid message. */
export function parseMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  return messageFromObject(parsed);
}

function messageFromObject(obj: object): ClientMessage | null {
  const { type } = obj as { type?: unknown };
  if (type === "join") return joinMessage(obj);
  if (type === "signUp") return { type: "signUp" };
  if (type === "keystroke") return keystrokeMessage(obj);
  return null;
}

function joinMessage(obj: unknown): ClientMessage | null {
  const { nickname } = obj as { nickname?: unknown };
  return typeof nickname === "string" ? { type: "join", nickname } : null;
}

function keystrokeMessage(obj: unknown): ClientMessage | null {
  const { key } = obj as { key?: unknown };
  return typeof key === "string" ? { type: "keystroke", key } : null;
}

/** Maps a validated client message to the engine event for this connection. */
function toEvent(playerId: string, msg: ClientMessage): GameEvent {
  switch (msg.type) {
    case "join":
      return { type: "join", playerId, nickname: msg.nickname };
    case "signUp":
      return { type: "signUp", playerId };
    case "keystroke":
      return { type: "keystroke", playerId, key: msg.key };
  }
}
