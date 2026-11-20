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

export interface SpectatorState {
  id: string;
  nickname: string;
}

export interface GameState {
  phase: Phase;
  /** Active players (the racing roster). Empty in the waiting phase. */
  players: PlayerState[];
  /** Spectators: joined but not in the current roster. Unlimited. */
  spectators: SpectatorState[];
  /** Player id holding the Start-Recht (null if no players). */
  startRight: string | null;
  /** The host's id (first joiner; promoted on host disconnect). */
  hostId: string | null;
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

export interface SpectatorSnapshot {
  id: string;
  nickname: string;
}

/** Serializable view of the game state, emitted to all clients. */
export interface Snapshot {
  phase: Phase;
  /** Waiting: empty. Lobby/round/results: the racing roster (ordered by Wertung in round/results). */
  players: PlayerSnapshot[];
  /** Spectators watching (not in the current roster). */
  spectators: SpectatorSnapshot[];
  startRight: string | null;
  /** The host's id (for UI: who can start a session / set duration). */
  hostId: string | null;
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
    spectators: [],
    startRight: null,
    hostId: null,
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

/**
 * Join is allowed in ALL phases (unlimited spectators).
 * A participant is in exactly one of players/spectators.
 * The first joiner becomes the host.
 */
function handleJoin(state: GameState, event: GameEvent & { type: "join" }): GameState | null {
  // No double-join (in either set).
  if (state.players.some((p) => p.id === event.playerId)) return null;
  if (state.spectators.some((s) => s.id === event.playerId)) return null;

  const isHost = state.hostId === null; // first joiner is the host
  const spectators = [...state.spectators, { id: event.playerId, nickname: event.nickname }];
  return {
    ...state,
    spectators,
    hostId: isHost ? event.playerId : state.hostId,
  };
}

/**
 * Waiting → Lobby: assembles the racing roster from spectators.
 * Only the host can trigger this. The winner (if any) is always included.
 * Roster is capped at MAX_PLAYERS; the rest stay as spectators.
 */
function handleStartSession(
  state: GameState,
  event: GameEvent & { type: "startSession" },
): GameState | null {
  if (state.phase !== "waiting") return null;
  if (state.hostId !== event.playerId) return null;
  if (state.spectators.length === 0) return null;

  const { players, spectators } = assembleRoster(state);
  const startRight = players.length > 0 ? players[0].id : null;
  return { ...state, phase: "lobby", players, spectators, startRight };
}

/**
 * Lobby → Round: starts the round. Only the start-right holder can trigger.
 * Resets per-round counters for all players.
 */
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
  const allDone = players.every((p) => p.cursor >= state.text.length);
  if (allDone) {
    const winner = rankPlayers(players, "results", state.duration)[0];
    return { ...state, players, phase: "results", winnerId: winner?.id ?? null };
  }
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

/**
 * Disconnect: removes the participant from players OR spectators.
 * In the round phase, removal from players is permanent (they don't re-join the round).
 * If the host disconnects, the next participant (first in join order) becomes host.
 */
function handleDisconnect(
  state: GameState,
  event: GameEvent & { type: "disconnect" },
): GameState | null {
  const inPlayers = state.players.some((p) => p.id === event.playerId);
  const inSpectators = state.spectators.some((s) => s.id === event.playerId);
  if (!inPlayers && !inSpectators) return null;

  let players = inPlayers ? state.players.filter((p) => p.id !== event.playerId) : state.players;
  const spectators = inSpectators
    ? state.spectators.filter((s) => s.id !== event.playerId)
    : state.spectators;

  // Host promotion: if the host left, the next participant (first in players, else first spectator) becomes host.
  let hostId = state.hostId;
  if (hostId === event.playerId) {
    hostId = players.length > 0 ? players[0].id : spectators.length > 0 ? spectators[0].id : null;
    if (hostId !== null) {
      players = players.map((p, i) => (i === 0 ? { ...p, isHost: true } : { ...p, isHost: false }));
    }
  }

  // Re-derive isHost flags (the first player is always the host if hostId matches).
  if (hostId !== null) {
    players = players.map((p) => ({ ...p, isHost: p.id === hostId }));
  } else {
    players = players.map((p) => ({ ...p, isHost: false }));
  }

  // Update startRight if the holder left.
  let startRight = state.startRight;
  if (startRight === event.playerId) {
    startRight = players.length > 0 ? players[0].id : null;
  }

  // In results: re-rank winner if the winner left.
  let winnerId = state.winnerId;
  if (state.phase === "results" && winnerId === event.playerId) {
    winnerId =
      players.length > 0 ? (rankPlayers(players, "results", state.duration)[0]?.id ?? null) : null;
  }

  // If no players remain, collapse to waiting (avoids a stuck lobby/round/results).
  if (players.length === 0 && state.phase !== "waiting") {
    return {
      ...state,
      phase: "waiting",
      players: [],
      spectators,
      hostId,
      startRight: null,
      text: "",
      timeRemaining: 0,
      winnerId: null,
    };
  }

  return { ...state, players, spectators, hostId, startRight, winnerId };
}

function handleSetDuration(
  state: GameState,
  event: GameEvent & { type: "setDuration" },
): GameState | null {
  if (state.phase !== "lobby") return null;
  if (state.hostId !== event.playerId) return null;
  if (!DURATIONS.includes(event.duration)) return null;
  return { ...state, duration: event.duration };
}

/**
 * Results → Waiting: all players become spectators (nickname preserved).
 * Start-Recht rotates to the next spectator in join order.
 */
function handleEndSession(
  state: GameState,
  event: GameEvent & { type: "endSession" },
): GameState | null {
  if (state.phase !== "results") return null;
  // The requester must be a participant (player or spectator).
  const isParticipant =
    state.players.some((p) => p.id === event.playerId) ||
    state.spectators.some((s) => s.id === event.playerId);
  if (!isParticipant) return null;

  // All players become spectators (reset per-round counters).
  const newSpectators: SpectatorState[] = [
    ...state.players.map((p) => ({ id: p.id, nickname: p.nickname })),
    ...state.spectators,
  ];

  // Rotate startRight among the new spectators (cyclic by join order).
  let startRight: string | null = null;
  if (newSpectators.length > 0) {
    const holderIdx = state.startRight
      ? newSpectators.findIndex((s) => s.id === state.startRight)
      : -1;
    const nextIdx = holderIdx >= 0 ? (holderIdx + 1) % newSpectators.length : 0;
    startRight = newSpectators[nextIdx].id;
  }

  return {
    ...state,
    phase: "waiting",
    players: [],
    spectators: newSpectators,
    startRight,
    text: "",
    timeRemaining: 0,
    winnerId: null,
  };
}

/**
 * Assembles the racing roster from spectators for the lobby.
 * The winner (if any) is always included. Remaining slots filled in join order.
 * Capped at MAX_PLAYERS.
 */
function assembleRoster(state: GameState): {
  players: PlayerState[];
  spectators: SpectatorState[];
} {
  const selected: SpectatorState[] = [];
  const remaining: SpectatorState[] = [];

  // Winner is always included first.
  const winnerSpec = state.winnerId
    ? state.spectators.find((s) => s.id === state.winnerId)
    : undefined;
  if (winnerSpec !== undefined) {
    selected.push(winnerSpec);
  }

  // Fill remaining slots in join order.
  for (const s of state.spectators) {
    if (selected.length >= MAX_PLAYERS) {
      remaining.push(s);
    } else if (!selected.some((x) => x.id === s.id)) {
      selected.push(s);
    } else {
      remaining.push(s);
    }
  }

  const hostId = state.hostId;
  const players: PlayerState[] = selected.map((s) => ({
    id: s.id,
    nickname: s.nickname,
    isHost: s.id === hostId,
    correct: 0,
    errors: 0,
    cursor: 0,
    lastTypedAt: null,
  }));

  return { players, spectators: remaining };
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
    spectators: state.spectators.map((s) => ({ id: s.id, nickname: s.nickname })),
    startRight: state.startRight,
    hostId: state.hostId,
    duration: state.duration,
    text: state.text,
    timeRemaining: state.timeRemaining,
    winnerId: state.winnerId,
  };
}
