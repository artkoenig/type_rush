import type { Duration } from "../content/textPool";
import { DURATIONS } from "../content/textPool";

/** Monotonic clock in seconds, injected by the caller (never wall-clock in tests). */
export type Clock = () => number;

export type Phase = "waiting" | "lobby" | "round" | "results";

export interface PlayerState {
  id: string;
  nickname: string;
  isHost: boolean;
  /** Correct keys typed in the current round. */
  correct: number;
  /** Wrong keys pressed in the current round (each wrong press counts, ADR 0003). */
  errors: number;
  /** Cursor position in the round text. */
  cursor: number;
  /** Round-timer value (duration - timeRemaining) at the last keystroke; null if none yet. */
  lastTypedAt: number | null;
}

export interface GameState {
  phase: Phase;
  /** Players in join order. */
  players: PlayerState[];
  /** Player id holding the Start-Recht (null if no players). */
  startRight: string | null;
  duration: Duration;
  /** Text all players type in the current/last round. */
  text: string;
  /** Seconds left in the current round. */
  timeRemaining: number;
  /** Clock reading when the round started. */
  clockAtRoundStart: number;
  /** Player with the highest final Wertung (null if none). */
  winnerId: string | null;
}

export type GameEvent =
  | { type: "join"; playerId: string; nickname: string }
  | { type: "startSession"; playerId: string }
  | { type: "start"; playerId: string; text: string }
  | { type: "keystroke"; playerId: string; key: string }
  | { type: "tick" }
  | { type: "disconnect"; playerId: string }
  | { type: "setDuration"; playerId: string; duration: Duration }
  | { type: "endSession"; playerId: string };

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  isHost: boolean;
  correct: number;
  errors: number;
  total: number;
  cursor: number;
  wertung: number;
  /** Round-timer value at the player's last keystroke (0 if none). Used for WPM display. */
  typingElapsed: number;
}

/** Serializable view of the game state, emitted to all clients. */
export interface Snapshot {
  phase: Phase;
  /** Waiting/lobby: join order. Round/results: leaderboard by Wertung (descending). */
  players: PlayerSnapshot[];
  startRight: string | null;
  duration: Duration;
  text: string;
  timeRemaining: number;
  winnerId: string | null;
}

export interface StepResult {
  newState: GameState;
  snapshots: Snapshot[];
}

export const MAX_PLAYERS = 8;

/** Wertung: 100·correct³ / (total²·elapsedSec), integer arithmetic, 0 if no keypresses. */
export function wertung(correct: number, errors: number, elapsedSec: number): number {
  const total = correct + errors;
  if (total === 0 || elapsedSec <= 0) return 0;
  return Math.floor((100 * correct ** 3) / (total ** 2 * elapsedSec));
}

/** Creates an empty game waiting for its first player (the host joins via the normal dialog). */
export function createGame(): GameState {
  return {
    phase: "waiting",
    players: [],
    startRight: null,
    duration: 60,
    text: "",
    timeRemaining: 0,
    clockAtRoundStart: 0,
    winnerId: null,
  };
}

/**
 * Advances the game by one event. Pure: same inputs always yield the same outputs,
 * the input state is never mutated. Rejected events return the same state and no snapshots.
 */
export function step(state: GameState, event: GameEvent, clock: Clock): StepResult {
  const next = apply(state, event, clock);
  if (next === null) return { newState: state, snapshots: [] };
  return { newState: next, snapshots: [toSnapshot(next)] };
}

function apply(state: GameState, event: GameEvent, clock: Clock): GameState | null {
  switch (event.type) {
    case "join":
      return handleJoin(state, event);
    case "startSession":
      return handleStartSession(state, event);
    case "start":
      return handleStart(state, event, clock);
    case "keystroke":
      return handleKeystroke(state, event);
    case "tick":
      return handleTick(state, clock);
    case "disconnect":
      return handleDisconnect(state, event);
    case "setDuration":
      return handleSetDuration(state, event);
    case "endSession":
      return handleEndSession(state, event);
  }
}

function handleJoin(state: GameState, event: GameEvent & { type: "join" }): GameState | null {
  if (state.phase !== "waiting" && state.phase !== "lobby") return null;
  if (state.players.length >= MAX_PLAYERS) return null;
  if (state.players.some((p) => p.id === event.playerId)) return null;
  const isHost = state.players.length === 0; // first joiner is the host
  const players = [
    ...state.players,
    {
      id: event.playerId,
      nickname: event.nickname,
      isHost,
      correct: 0,
      errors: 0,
      cursor: 0,
      lastTypedAt: null,
    },
  ];
  const startRight = state.startRight ?? (isHost ? event.playerId : null);
  return { ...state, players, startRight };
}

function handleStartSession(
  state: GameState,
  event: GameEvent & { type: "startSession" },
): GameState | null {
  if (state.phase !== "waiting") return null;
  const player = state.players.find((p) => p.id === event.playerId);
  if (player === undefined || !player.isHost) return null;
  return { ...state, phase: "lobby" };
}

function handleStart(
  state: GameState,
  event: GameEvent & { type: "start" },
  clock: Clock,
): GameState | null {
  if (state.phase !== "lobby") return null;
  if (state.startRight !== event.playerId) return null;
  if (state.players.length < 1) return null;
  return {
    ...state,
    phase: "round",
    text: event.text,
    timeRemaining: state.duration,
    clockAtRoundStart: clock(),
    winnerId: null,
    players: state.players.map((p) => ({
      ...p,
      correct: 0,
      errors: 0,
      cursor: 0,
      lastTypedAt: null,
    })),
  };
}

function handleKeystroke(
  state: GameState,
  event: GameEvent & { type: "keystroke" },
): GameState | null {
  if (state.phase !== "round") return null;
  const player = state.players.find((p) => p.id === event.playerId);
  if (player === undefined) return null;
  if (event.key.length !== 1) return null;
  if (player.cursor >= state.text.length) return null; // text finished; further keys are ignored
  const expected = state.text[player.cursor];
  const elapsed = state.duration - state.timeRemaining;
  const players = state.players.map((p) => {
    if (p.id !== event.playerId) return p;
    if (event.key === expected) {
      return {
        ...p,
        correct: p.correct + 1,
        cursor: p.cursor + 1,
        lastTypedAt: elapsed,
      };
    }
    return { ...p, errors: p.errors + 1, lastTypedAt: elapsed };
  });
  return { ...state, players };
}

function handleTick(state: GameState, clock: Clock): GameState | null {
  if (state.phase !== "round") return null;
  const elapsed = clock() - state.clockAtRoundStart;
  const timeRemaining = Math.max(0, state.duration - elapsed);
  if (timeRemaining > 0) return { ...state, timeRemaining };
  // Round over → results.
  const winner =
    state.players.length > 0 ? rankPlayers(state.players, "results", state.duration)[0] : null;
  return { ...state, phase: "results", timeRemaining: 0, winnerId: winner?.id ?? null };
}

// If the host left, the new first player in join order becomes the host.
function promoteNewHost(players: PlayerState[]): PlayerState[] {
  if (players.length === 0) return players;
  return players.map((p, i) => (i === 0 ? { ...p, isHost: true } : p));
}

function nextStartRight(players: PlayerState[]): string | null {
  const first = players[0];
  return first ? first.id : null;
}

function rankWinner(players: PlayerState[], duration: number): string | null {
  const winner = rankPlayers(players, "results", duration)[0];
  return winner ? winner.id : null;
}

function handleDisconnect(
  state: GameState,
  event: GameEvent & { type: "disconnect" },
): GameState | null {
  const player = state.players.find((p) => p.id === event.playerId);
  if (player === undefined) return null;
  let players = state.players.filter((p) => p.id !== event.playerId);
  if (player.isHost) players = promoteNewHost(players);
  // Round: removed from round and leaderboard; the round runs to completion.
  if (state.phase === "round") return { ...state, players };
  if (state.phase === "results") {
    return { ...state, players, winnerId: rankWinner(players, state.duration) };
  }
  // Waiting / lobby: if the leaver held the start right, it passes to the first remaining player.
  const startRight =
    state.startRight === event.playerId ? nextStartRight(players) : state.startRight;
  return { ...state, players, startRight };
}

function handleSetDuration(
  state: GameState,
  event: GameEvent & { type: "setDuration" },
): GameState | null {
  if (state.phase !== "lobby") return null;
  const player = state.players.find((p) => p.id === event.playerId);
  if (player === undefined || !player.isHost) return null;
  if (!DURATIONS.includes(event.duration)) return null;
  return { ...state, duration: event.duration };
}

function handleEndSession(
  state: GameState,
  event: GameEvent & { type: "endSession" },
): GameState | null {
  if (state.phase !== "results") return null;
  if (!state.players.some((p) => p.id === event.playerId)) return null;
  const players = state.players.map((p) => ({
    ...p,
    correct: 0,
    errors: 0,
    cursor: 0,
    lastTypedAt: null,
  }));
  if (players.length === 0) {
    return {
      ...state,
      phase: "waiting",
      players,
      startRight: null,
      text: "",
      timeRemaining: 0,
      winnerId: null,
    };
  }
  // Start-Recht rotates to the next player in join order (cyclic).
  const holderIndex = players.findIndex((p) => p.id === state.startRight);
  const next = players[(holderIndex + 1) % players.length];
  return {
    ...state,
    phase: "waiting",
    players,
    startRight: next.id, // safe: results always has at least one player
    text: "",
    timeRemaining: 0,
    winnerId: null,
  };
}

/**
 * Players ordered by Wertung (descending); ties keep join order.
 * In the results phase the full duration is used as elapsed; in the round phase
 * each player's own lastTypedAt (frozen at their last keystroke) is used.
 */
function rankPlayers(
  players: readonly PlayerState[],
  phase: Phase,
  duration: number,
): PlayerState[] {
  return [...players].sort((a, b) => {
    const elapsedA = phase === "results" ? duration : (a.lastTypedAt ?? 0);
    const elapsedB = phase === "results" ? duration : (b.lastTypedAt ?? 0);
    return wertung(b.correct, b.errors, elapsedB) - wertung(a.correct, a.errors, elapsedA);
  });
}

export function toSnapshot(state: GameState): Snapshot {
  const ordered =
    state.phase === "round" || state.phase === "results"
      ? rankPlayers(state.players, state.phase, state.duration)
      : state.players;
  return {
    phase: state.phase,
    players: ordered.map((p) => {
      const elapsed = state.phase === "results" ? state.duration : (p.lastTypedAt ?? 0);
      return {
        id: p.id,
        nickname: p.nickname,
        isHost: p.isHost,
        correct: p.correct,
        errors: p.errors,
        total: p.correct + p.errors,
        cursor: p.cursor,
        wertung: elapsed > 0 ? wertung(p.correct, p.errors, elapsed) : 0,
        typingElapsed: p.lastTypedAt ?? 0,
      };
    }),
    startRight: state.startRight,
    duration: state.duration,
    text: state.text,
    timeRemaining: state.timeRemaining,
    winnerId: state.winnerId,
  };
}
