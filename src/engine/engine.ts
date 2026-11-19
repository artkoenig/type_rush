import type { Duration } from "../content/textPool";
import { DURATIONS } from "../content/textPool";

/** Monotonic clock in seconds, injected by the caller (never wall-clock in tests). */
export type Clock = () => number;

export type Phase = "lobby" | "round" | "results" | "gameover";

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
  | { type: "start"; playerId: string; text: string }
  | { type: "keystroke"; playerId: string; key: string }
  | { type: "tick" }
  | { type: "disconnect"; playerId: string }
  | { type: "setDuration"; playerId: string; duration: Duration }
  | { type: "backToLobby"; playerId: string };

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  isHost: boolean;
  correct: number;
  errors: number;
  total: number;
  cursor: number;
  wertung: number;
}

/** Serializable view of the game state, emitted to all clients. */
export interface Snapshot {
  phase: Phase;
  /** Lobby: join order. Round/results: leaderboard by Wertung (descending). */
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
export const DEFAULT_NICKNAME = "Host";

/** Wertung: 100·correct³ / (total²·elapsedSec), integer arithmetic, 0 if no keypresses. */
export function wertung(correct: number, errors: number, elapsedSec: number): number {
  const total = correct + errors;
  if (total === 0 || elapsedSec <= 0) return 0;
  return Math.floor((100 * correct ** 3) / (total ** 2 * elapsedSec));
}

/** Creates a new game; the host auto-joins with the default nickname. */
export function createGame(hostId: string): GameState {
  return {
    phase: "lobby",
    players: [
      { id: hostId, nickname: DEFAULT_NICKNAME, isHost: true, correct: 0, errors: 0, cursor: 0 },
    ],
    startRight: hostId,
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
    case "backToLobby":
      return handleBackToLobby(state, event);
  }
}

function handleJoin(state: GameState, event: GameEvent & { type: "join" }): GameState | null {
  if (state.phase !== "lobby") return null;
  if (state.players.length >= MAX_PLAYERS) return null;
  if (state.players.some((p) => p.id === event.playerId)) return null;
  const players = [
    ...state.players,
    {
      id: event.playerId,
      nickname: event.nickname,
      isHost: false,
      correct: 0,
      errors: 0,
      cursor: 0,
    },
  ];
  return { ...state, players };
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
    players: state.players.map((p) => ({ ...p, correct: 0, errors: 0, cursor: 0 })),
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
  const players = state.players.map((p) => {
    if (p.id !== event.playerId) return p;
    if (event.key === expected) return { ...p, correct: p.correct + 1, cursor: p.cursor + 1 };
    return { ...p, errors: p.errors + 1 }; // blocking error: cursor does not advance (ADR 0003)
  });
  return { ...state, players };
}

function handleTick(state: GameState, clock: Clock): GameState | null {
  if (state.phase !== "round") return null;
  const elapsed = clock() - state.clockAtRoundStart;
  const timeRemaining = Math.max(0, state.duration - elapsed);
  if (timeRemaining > 0) return { ...state, timeRemaining };
  // Round over: results, or GameOver if the round ended empty (defensive).
  if (state.players.length === 0)
    return { ...state, phase: "gameover", timeRemaining: 0, winnerId: null };
  const winner = rankPlayers(state.players, state.duration)[0];
  // The host always plays, so the round never ends with zero players (see guard above).
  return { ...state, phase: "results", timeRemaining: 0, winnerId: winner.id };
}

function handleDisconnect(
  state: GameState,
  event: GameEvent & { type: "disconnect" },
): GameState | null {
  const player = state.players.find((p) => p.id === event.playerId);
  if (player === undefined) return null;
  // Host leaving ends the game for everyone (ADR 0001).
  if (player.isHost) {
    return {
      ...state,
      phase: "gameover",
      players: state.players.filter((p) => p.id !== event.playerId),
    };
  }
  const players = state.players.filter((p) => p.id !== event.playerId);
  if (state.phase === "lobby") {
    // The host always plays, so at least one player remains after a non-host leaves.
    const startRight = state.startRight === event.playerId ? players[0].id : state.startRight;
    return { ...state, players, startRight };
  }
  if (state.phase === "results") {
    if (players.length === 0) return { ...state, phase: "gameover", players, winnerId: null };
    const winner = rankPlayers(players, state.duration)[0];
    return { ...state, players, winnerId: winner.id };
  }
  // Round: removed from round and leaderboard; the round runs to completion.
  return { ...state, players };
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

function handleBackToLobby(
  state: GameState,
  event: GameEvent & { type: "backToLobby" },
): GameState | null {
  if (state.phase !== "results") return null;
  if (!state.players.some((p) => p.id === event.playerId)) return null;
  const players = state.players.map((p) => ({ ...p, correct: 0, errors: 0, cursor: 0 }));
  // Start-Recht rotates to the next player in join order (cyclic).
  const holderIndex = players.findIndex((p) => p.id === state.startRight);
  const next = players[(holderIndex + 1) % players.length];
  return {
    ...state,
    phase: "lobby",
    players,
    startRight: next.id, // safe: results always has at least the host
    text: "",
    timeRemaining: 0,
    winnerId: null,
  };
}

/** Players ordered by Wertung (descending); ties keep join order. */
function rankPlayers(players: readonly PlayerState[], elapsedSec: number): PlayerState[] {
  return [...players].sort(
    (a, b) => wertung(b.correct, b.errors, elapsedSec) - wertung(a.correct, a.errors, elapsedSec),
  );
}

function leaderboard(state: GameState, elapsedSec: number): PlayerState[] {
  return rankPlayers(state.players, elapsedSec);
}

function liveElapsed(state: GameState): number {
  return Math.max(1, state.duration - state.timeRemaining);
}

function toSnapshot(state: GameState): Snapshot {
  const elapsed =
    state.phase === "round" ? liveElapsed(state) : state.phase === "results" ? state.duration : 0;
  const ordered =
    state.phase === "round" || state.phase === "results"
      ? leaderboard(state, elapsed)
      : state.players;
  return {
    phase: state.phase,
    players: ordered.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isHost: p.isHost,
      correct: p.correct,
      errors: p.errors,
      total: p.correct + p.errors,
      cursor: p.cursor,
      wertung: elapsed > 0 ? wertung(p.correct, p.errors, elapsed) : 0,
    })),
    startRight: state.startRight,
    duration: state.duration,
    text: state.text,
    timeRemaining: state.timeRemaining,
    winnerId: state.winnerId,
  };
}
