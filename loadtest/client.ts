import WebSocket from "ws";
import type { Phase, PhaseBucket } from "./types.js";
import type { Snapshot } from "../src/engine/engine.js";

/** A simulated user: one real WebSocket connection to the server. */
export interface UserOptions {
  url: string;
  nickname: string;
  /** Players sign up and type in rounds; spectators only watch. */
  isPlayer: boolean;
  /** Keystrokes per second each player emits (players only). */
  keystrokeRate: number;
  /** Fraction of keystrokes that are wrong (players only). */
  errorRate: number;
  /** Called when the user observes a *change* of phase (for scenario tracking). */
  onPhase?: (phase: Phase) => void;
}

type MsgKind = "join" | "signUp" | "keystroke";

interface PendingAck {
  since: number;
  kind: MsgKind;
  before: string;
}

/**
 * One simulated participant. Players (8) do a full snapshot parse to drive the
 * typing loop and detect their own keystroke being processed; spectators (N-8)
 * only do a cheap phase extraction so the harness stays light and does not
 * compete with the server for CPU.
 */
export class SimulatedUser {
  private ws: WebSocket | null = null;
  private myId: string | null = null;
  private phase: Phase = "lobby";
  private lastNotified: Phase | null = null;
  private lastSnapTime: number | null = null;
  private pending: PendingAck | null = null;
  private typingTimer: NodeJS.Timeout | null = null;
  private resolveConnect: (() => void) | null = null;
  private joinedConfirmed = false;

  // tracked state from the latest snapshot (players only)
  private curInPlayers = false;
  private curInSpectators = false;
  private curCorrect = 0;
  private curErrors = 0;
  private curCursor = 0;
  private curText = "";

  private buckets = new Map<Phase, PhaseBucket>();

  constructor(readonly opts: UserOptions) {}

  /** Connect, wait for hello, send join, and resolve once the join is confirmed. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.resolveConnect = () => {
        if (!this.joinedConfirmed) {
          this.joinedConfirmed = true;
          resolve();
        }
      };
      const ws = new WebSocket(this.opts.url);
      this.ws = ws;
      ws.on("message", (data) => this.handleMessage(data.toString()));
      ws.on("error", (err) => reject(err));
      ws.on("close", () => {
        this.ws = null;
      });
      if (this.opts.isPlayer) this.startTypingLoop();
    });
  }

  /** Send a signUp (players, to join the racing roster). */
  signUp(): void {
    this.send({ type: "signUp" });
  }

  /** Close the connection and stop any timers. */
  stop(): void {
    if (this.typingTimer) {
      clearInterval(this.typingTimer);
      this.typingTimer = null;
    }
    const ws = this.ws;
    if (ws) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      ws.removeAllListeners();
      this.ws = null;
    }
  }

  /** The phase this user most recently observed. */
  get currentPhase(): Phase {
    return this.phase;
  }

  /** Per-phase metric buckets accumulated so far. */
  collect(): Map<Phase, PhaseBucket> {
    return this.buckets;
  }

  private send(msg: Record<string, unknown>): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const kind = msg.type as MsgKind;
    this.pending = { since: Date.now(), kind, before: this.fingerprint(kind) };
    ws.send(JSON.stringify(msg));
    this.bucket(this.phase).messages++;
  }

  private handleMessage(data: string): void {
    if (data.includes('"type":"hello"')) {
      if (this.opts.isPlayer) this.myId = (JSON.parse(data) as { playerId: string }).playerId;
      this.send({ type: "join", nickname: this.opts.nickname });
      return;
    }
    if (this.opts.isPlayer) this.handlePlayerSnapshot(data);
    else this.handleSpectatorSnapshot(data);
  }

  private handlePlayerSnapshot(data: string): void {
    const snap = JSON.parse(data) as Snapshot;
    if (typeof snap.phase !== "string") return;
    const now = Date.now();
    const me = snap.players.find((p) => p.id === this.myId);
    this.curInPlayers = me !== undefined;
    this.curInSpectators = snap.spectators.some((s) => s.id === this.myId);
    if (me) {
      this.curCorrect = me.correct;
      this.curErrors = me.errors;
      this.curCursor = me.cursor;
    }
    this.curText = snap.text;
    this.recordSnapshot(snap.phase as Phase, data.length, now);
    this.resolveConnect?.();
  }

  private handleSpectatorSnapshot(data: string): void {
    this.recordSnapshot(extractPhase(data), data.length, Date.now());
    this.resolveConnect?.();
  }

  private recordSnapshot(phase: Phase, sizeChars: number, now: number): void {
    const changed = phase !== this.phase;
    this.phase = phase;
    const b = this.bucket(phase);
    b.snapshots++;
    b.bytes.push(sizeChars);
    if (this.lastSnapTime !== null) b.cadence.push(now - this.lastSnapTime);
    this.lastSnapTime = now;

    if (this.pending) {
      const after = this.fingerprint(this.pending.kind);
      if (after !== this.pending.before) {
        b.ack.push(now - this.pending.since);
        this.pending = null;
      }
    }

    if (changed && phase !== this.lastNotified) {
      this.lastNotified = phase;
      this.opts.onPhase?.(phase);
    }
  }

  /** A cheap fingerprint of the state a given message is expected to change. */
  private fingerprint(kind: MsgKind): string {
    if (kind === "join") return this.curInPlayers || this.curInSpectators ? "in" : "out";
    if (kind === "signUp") return this.curInPlayers ? "player" : "spect";
    return `${this.curCorrect}:${this.curErrors}`;
  }

  private startTypingLoop(): void {
    if (this.typingTimer) return;
    const intervalMs = 1000 / Math.max(1, this.opts.keystrokeRate);
    this.typingTimer = setInterval(() => this.typeOnce(), intervalMs);
    this.typingTimer.unref?.();
  }

  private typeOnce(): void {
    if (this.phase !== "round" || !this.curInPlayers) return;
    const expected = this.curText[this.curCursor];
    if (expected === undefined) return; // text finished
    const key = Math.random() < this.opts.errorRate ? this.wrongKey(expected) : expected;
    this.send({ type: "keystroke", key });
  }

  private wrongKey(expected: string): string {
    const keys = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 8; i++) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      if (k !== expected) return k;
    }
    return expected === "a" ? "b" : "a";
  }

  private bucket(phase: Phase): PhaseBucket {
    let b = this.buckets.get(phase);
    if (!b) {
      b = { ack: [], snapshots: 0, bytes: [], cadence: [], messages: 0 };
      this.buckets.set(phase, b);
    }
    return b;
  }
}

/** Cheap phase extraction without a full JSON parse (spectators only). */
function extractPhase(data: string): Phase {
  if (data.includes('"phase":"round"')) return "round";
  if (data.includes('"phase":"countdown"')) return "countdown";
  return "lobby";
}
