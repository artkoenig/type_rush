import {
  createGame,
  step,
  toSnapshot,
  type Clock,
  type GameEvent,
  type GameState,
  type Snapshot,
} from "../engine/engine.js";
import { calibrateText, DURATIONS, type Duration } from "../content/textPool.js";

/** Minimal transport a player session talks to (one per WebSocket connection). */
export interface ClientConnection {
  readonly id: string;
  send(data: string): void;
}

/** Messages a client may send; the playerId is derived from the connection. */
export type ClientMessage =
  | { type: "join"; nickname: string }
  | { type: "start" }
  | { type: "keystroke"; key: string }
  | { type: "setDuration"; duration: Duration }
  | { type: "backToLobby" };

export interface GameServerOptions {
  /** Time source for the engine clock, in seconds. Defaults to real time. */
  clock?: Clock;
  /** RNG for text selection. Defaults to Math.random. */
  rng?: () => number;
}

/**
 * Bridges WebSocket connections to the pure game engine: parses client
 * messages, forwards them as engine events, and broadcasts snapshots.
 * The first connection becomes the host and auto-joins as "Host".
 */
export class GameServer {
  private state: GameState | null = null;
  private conns = new Map<string, ClientConnection>();
  private clock: Clock;
  private rng: () => number;

  constructor(options: GameServerOptions = {}) {
    this.clock = options.clock ?? (() => Date.now() / 1000);
    this.rng = options.rng ?? Math.random;
  }

  /** A new connection. The first one creates the game and becomes the host. */
  connect(conn: ClientConnection): void {
    this.conns.set(conn.id, conn);
    if (this.state === null) {
      this.state = createGame(conn.id);
      this.broadcast();
      return;
    }
    conn.send(JSON.stringify(toSnapshot(this.state)));
  }

  /** A client sent a raw (JSON) message. */
  message(conn: ClientConnection, raw: string): void {
    if (this.state === null) return;
    const msg = parseMessage(raw);
    if (msg === null) return;
    this.apply(toEvent(conn.id, msg, this.state, this.rng));
  }

  /** A client disconnected. */
  disconnect(conn: ClientConnection): void {
    this.conns.delete(conn.id);
    if (this.state === null) return;
    this.apply({ type: "disconnect", playerId: conn.id });
  }

  /** Advance the engine clock (driven by a 1s interval in the host process). */
  tick(): void {
    if (this.state === null) return;
    this.apply({ type: "tick" });
  }

  /** Current snapshot, or null before the host connected. */
  snapshot(): Snapshot | null {
    return this.state === null ? null : toSnapshot(this.state);
  }

  private apply(event: GameEvent): void {
    if (this.state === null) return;
    const result = step(this.state, event, this.clock);
    this.state = result.newState;
    if (result.snapshots.length > 0) this.broadcast();
  }

  private broadcast(): void {
    if (this.state === null) return;
    const data = JSON.stringify(toSnapshot(this.state));
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

function messageFromObject(obj: unknown): ClientMessage | null {
  if (typeof obj !== "object" || obj === null) return null;
  const { type } = obj as { type?: unknown };
  if (type === "join") return joinMessage(obj);
  if (type === "start") return { type: "start" };
  if (type === "keystroke") return keystrokeMessage(obj);
  if (type === "setDuration") return setDurationMessage(obj);
  if (type === "backToLobby") return { type: "backToLobby" };
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

function setDurationMessage(obj: unknown): ClientMessage | null {
  const { duration } = obj as { duration?: unknown };
  return isDuration(duration) ? { type: "setDuration", duration } : null;
}

function isDuration(value: unknown): value is Duration {
  return DURATIONS.includes(value as Duration);
}

/** Maps a validated client message to the engine event for this connection. */
function toEvent(
  playerId: string,
  msg: ClientMessage,
  state: GameState,
  rng: () => number,
): GameEvent {
  switch (msg.type) {
    case "join":
      return { type: "join", playerId, nickname: msg.nickname };
    case "start":
      return { type: "start", playerId, text: calibrateText(state.duration, rng) };
    case "keystroke":
      return { type: "keystroke", playerId, key: msg.key };
    case "setDuration":
      return { type: "setDuration", playerId, duration: msg.duration };
    case "backToLobby":
      return { type: "backToLobby", playerId };
  }
}
