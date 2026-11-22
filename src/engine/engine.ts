import { calibrateText, type Duration } from "../content/textPool";

/** Monotonic clock in seconds, injected by the caller (never wall-clock in tests). */
export type Clock = () => number;

/**
 * Phase cycle (hostless, auto-starting): lobby → countdown → round → results → lobby → …
 * There is no "waiting" phase and no host: the lobby is always open, and rounds start on their own.
 */
export type Phase = "lobby" | "countdown" | "round" | "results";

/** Fixed phase durations, in seconds. */
export const LOBBY_DURATION = 30;
export const COUNTDOWN_DURATION = 5;
export const ROUND_DURATION = 60;
/** How long the results are displayed before the game returns to the lobby. */
export const RESULTS_DURATION = 10;

/** Maximum number of players in the racing roster. */
export const MAX_PLAYERS = 8;

export interface PlayerState {
  id: string;
  nickname: string;
  /** Correct keys typed in the current round. */
  correct: number;
  /** Wrong keys pressed in the current round (each wrong press counts, ADR 0003). */
  errors: number;
  /** Cursor position in the round text. */
  cursor: number;
  /** Round elapsed (seconds) at the player's last keystroke; null if none yet. */
  lastTypedAt: number | null;
}

export interface SpectatorState {
  id: string;
  nickname: string;
}

export interface GameState {
  phase: Phase;
  /** Active players (the racing roster). */
  players: PlayerState[];
  /** Spectators: joined but not in the current roster. Unlimited. */
  spectators: SpectatorState[];
  /** Text all players type in the current/last round. */
  text: string;
  /** Seconds left in the current phase (30 lobby / 5 countdown / 60 round / 0 results). */
  timeRemaining: number;
  /** Clock reading when the current phase began (drives the results display time). */
  clockAtPhaseStart: number;
  /** Player with the highest final Wertung (null if none). */
  winnerId: string | null;
  /** 1-based round counter (0 before the first round). */
  roundNumber: number;
}

export type GameEvent =
  | { type: "join"; playerId: string; nickname: string }
  | { type: "signUp"; playerId: string }
  | { type: "keystroke"; playerId: string; key: string }
  | { type: "tick" }
  | { type: "disconnect"; playerId: string };

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  correct: number;
  errors: number;
  total: number;
  cursor: number;
  wertung: number;
  /** Round elapsed (seconds) at the player's last keystroke (0 if none). Used for WPM display. */
  typingElapsed: number;
}

export interface SpectatorSnapshot {
  id: string;
  nickname: string;
}

/** Serializable view of the game state, emitted to all clients. */
export interface Snapshot {
  phase: Phase;
  /** The racing roster (ordered by Wertung in round/results; join order otherwise). */
  players: PlayerSnapshot[];
  /** Spectators watching (not in the current roster). */
  spectators: SpectatorSnapshot[];
  text: string;
  timeRemaining: number;
  winnerId: string | null;
  roundNumber: number;
}

export interface StepResult {
  newState: GameState;
  snapshots: Snapshot[];
}

/** Wertung: 100·correct³ / (total²·elapsedSec), integer arithmetic, 0 if no keypresses. */
export function wertung(correct: number, errors: number, elapsedSec: number): number {
  const total = correct + errors;
  if (total === 0 || elapsedSec <= 0) return 0;
  return Math.floor((100 * correct ** 3) / (total ** 2 * elapsedSec));
}

/**
 * Creates an empty game in the lobby. The lobby is always open; the 30s
 * participation timer is loaded but only runs once the first player signs up.
 */
export function createGame(): GameState {
  return {
    phase: "lobby",
    players: [],
    spectators: [],
    text: "",
    timeRemaining: LOBBY_DURATION,
    clockAtPhaseStart: 0,
    winnerId: null,
    roundNumber: 0,
  };
}

/**
 * Advances the game by one event. Pure: same inputs always yield the same outputs,
 * the input state is never mutated. Rejected events return the same state and no snapshots.
 *
 * `rng` picks the round text when a round auto-starts (deterministic when seeded).
 */
export function step(
  state: GameState,
  event: GameEvent,
  clock: Clock,
  rng: () => number = Math.random,
): StepResult {
  const next = apply(state, event, clock, rng);
  if (next === null) return { newState: state, snapshots: [] };
  return { newState: next, snapshots: [toSnapshot(next)] };
}

function apply(
  state: GameState,
  event: GameEvent,
  clock: Clock,
  rng: () => number,
): GameState | null {
  switch (event.type) {
    case "join":
      return handleJoin(state, event);
    case "signUp":
      return settle(handleSignUp(state, event), clock, rng);
    case "keystroke":
      return settle(handleKeystroke(state, event), clock, rng);
    case "tick":
      return handleTick(state, clock, rng);
    case "disconnect":
      return settle(handleDisconnect(state, event), clock, rng);
  }
}

/**
 * Join is allowed in ALL phases (unlimited spectators). A participant is in exactly
 * one of players/spectators. There is no host: everyone joins as a spectator.
 */
function handleJoin(state: GameState, event: GameEvent & { type: "join" }): GameState | null {
  if (state.players.some((p) => p.id === event.playerId)) return null;
  if (state.spectators.some((s) => s.id === event.playerId)) return null;
  const spectators = [...state.spectators, { id: event.playerId, nickname: event.nickname }];
  return { ...state, spectators };
}

/**
 * SignUp: spectator → player ("Ich spiele mit!"). Only in the lobby, roster not full.
 * The first player to sign up (roster was empty) loads the 30s participation timer.
 */
function handleSignUp(state: GameState, event: GameEvent & { type: "signUp" }): GameState | null {
  if (state.phase !== "lobby") return null;
  const spectator = state.spectators.find((s) => s.id === event.playerId);
  if (spectator === undefined) return null;
  if (state.players.length >= MAX_PLAYERS) return null;
  const wasEmpty = state.players.length === 0;
  const players = [
    ...state.players,
    {
      id: spectator.id,
      nickname: spectator.nickname,
      correct: 0,
      errors: 0,
      cursor: 0,
      lastTypedAt: null,
    },
  ];
  const remaining = state.spectators.filter((s) => s.id !== event.playerId);
  return {
    ...state,
    players,
    spectators: remaining,
    timeRemaining: wasEmpty ? LOBBY_DURATION : state.timeRemaining,
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
  if (player.cursor >= state.text.length) return null; // finished; ignore further keys
  const expected = state.text[player.cursor];
  const elapsed = ROUND_DURATION - state.timeRemaining;
  const players = state.players.map((p) => {
    if (p.id !== event.playerId) return p;
    if (event.key === expected) {
      return { ...p, correct: p.correct + 1, cursor: p.cursor + 1, lastTypedAt: elapsed };
    }
    return { ...p, errors: p.errors + 1, lastTypedAt: elapsed };
  });
  return { ...state, players };
}

/**
 * Tick: decrements the phase timer (only when it is running) and applies any
 * transition the new value triggers. In results the timer is idle; after the
 * results display time elapses the game returns to the lobby (hostless auto-cycle).
 */
function handleTick(state: GameState, clock: Clock, rng: () => number): GameState | null {
  if (state.phase === "results") {
    return clock() - state.clockAtPhaseStart >= RESULTS_DURATION ? backToLobby(state, clock) : null;
  }
  if (!isTimerRunning(state)) return null; // e.g. lobby with no players: timer is idle
  return settle({ ...state, timeRemaining: state.timeRemaining - 1 }, clock, rng);
}

/**
 * Whether the phase timer is counting down. In the lobby it runs only once at least one
 * player has signed up; in the countdown and round it runs while any time remains.
 */
function isTimerRunning(state: GameState): boolean {
  if (state.phase === "lobby") return state.timeRemaining > 0 && state.players.length > 0;
  return state.timeRemaining > 0; // countdown and round
}

/**
 * Disconnect: removes the participant from players OR spectators. If the winner
 * leaves it is re-derived (results) or cleared. In the lobby, if the roster becomes
 * empty, the 30s participation timer is reloaded.
 */
function handleDisconnect(
  state: GameState,
  event: GameEvent & { type: "disconnect" },
): GameState | null {
  const inPlayers = state.players.some((p) => p.id === event.playerId);
  const inSpectators = state.spectators.some((s) => s.id === event.playerId);
  if (!inPlayers && !inSpectators) return null;

  const players = inPlayers ? state.players.filter((p) => p.id !== event.playerId) : state.players;
  const spectators = inSpectators
    ? state.spectators.filter((s) => s.id !== event.playerId)
    : state.spectators;

  return {
    ...state,
    players,
    spectators,
    winnerId: rederiveWinner(state, players, event.playerId),
    timeRemaining: lobbyTimer(state, players),
  };
}

/**
 * If the leaving player was the winner, re-derive it from the remaining roster. The winner
 * is only re-derived in the results; otherwise (or with an empty roster) it is cleared.
 */
function rederiveWinner(state: GameState, players: PlayerState[], playerId: string): string | null {
  if (state.winnerId !== playerId) return state.winnerId;
  if (state.phase !== "results" || players.length === 0) return null;
  return rankPlayers(players, "results")[0].id;
}

/** Reloads the 30s lobby timer when the roster becomes empty; otherwise keeps it. */
function lobbyTimer(state: GameState, players: PlayerState[]): number {
  return state.phase === "lobby" && players.length === 0 ? LOBBY_DURATION : state.timeRemaining;
}

/**
 * Applies the phase transitions the current state triggers, cascading until stable:
 * lobby → countdown, countdown → round, round → results. Results → lobby is handled
 * in {@link handleTick} (clock-based). Each rule returns the same state object when it
 * does not fire, which stops the cascade.
 */
function settle(state: GameState | null, clock: Clock, rng: () => number): GameState | null {
  if (state === null) return null;
  let s = state;
  for (let i = 0; i < 8; i++) {
    const next = transition(s, clock, rng);
    if (next === s) break; // stable: no transition fired
    s = next;
  }
  return s;
}

/** The single transition a state can make right now, or the same state if none applies. */
function transition(state: GameState, clock: Clock, rng: () => number): GameState {
  if (state.phase === "lobby") return settleLobby(state, clock);
  if (state.phase === "countdown") return settleCountdown(state, clock, rng);
  if (state.phase === "round") return settleRound(state, clock);
  return state; // results: no timer-driven transition here
}

/**
 * Lobby → countdown when the roster is full, or the timer hits 0 with 2+ players.
 * A 0-timer with fewer than 2 players just reloads the lobby timer (still waiting).
 */
function settleLobby(state: GameState, clock: Clock): GameState {
  if (state.timeRemaining === 0 && state.players.length < 2) {
    return { ...state, timeRemaining: LOBBY_DURATION };
  }
  const rosterFull = state.players.length === MAX_PLAYERS;
  const timerUp = state.timeRemaining === 0 && state.players.length >= 2;
  if (rosterFull || timerUp) {
    return {
      ...state,
      phase: "countdown",
      timeRemaining: COUNTDOWN_DURATION,
      clockAtPhaseStart: clock(),
    };
  }
  return state;
}

/** Countdown → round when the timer hits 0: pick a text, reset counters, increment the round. */
function settleCountdown(state: GameState, clock: Clock, rng: () => number): GameState {
  if (state.timeRemaining !== 0) return state;
  return {
    ...state,
    phase: "round",
    timeRemaining: ROUND_DURATION,
    text: calibrateText(ROUND_DURATION as Duration, rng),
    roundNumber: state.roundNumber + 1,
    winnerId: null,
    clockAtPhaseStart: clock(),
    players: state.players.map((p) => ({
      ...p,
      correct: 0,
      errors: 0,
      cursor: 0,
      lastTypedAt: null,
    })),
  };
}

/** Round → results when the timer hits 0 or every player has finished the text. */
function settleRound(state: GameState, clock: Clock): GameState {
  const allFinished =
    state.players.length > 0 && state.players.every((p) => p.cursor >= state.text.length);
  if (state.timeRemaining !== 0 && !allFinished) return state;
  const winner = state.players.length > 0 ? rankPlayers(state.players, "results")[0] : null;
  return {
    ...state,
    phase: "results",
    timeRemaining: 0,
    winnerId: winner?.id ?? null,
    clockAtPhaseStart: clock(),
  };
}

/**
 * Results → lobby: all players become spectators again (they must re-sign up for the
 * next round). The 30s participation timer is reloaded.
 */
function backToLobby(state: GameState, clock: Clock): GameState {
  const spectators = [
    ...state.spectators,
    ...state.players.map((p) => ({ id: p.id, nickname: p.nickname })),
  ];
  return {
    ...state,
    phase: "lobby",
    players: [],
    spectators,
    winnerId: null,
    timeRemaining: LOBBY_DURATION,
    clockAtPhaseStart: clock(),
  };
}

/**
 * Players ordered by Wertung (descending); ties keep join order. In the results phase
 * the full round duration is used as elapsed; in the round phase each player's own
 * lastTypedAt (frozen at their last keystroke) is used.
 */
function rankPlayers(players: readonly PlayerState[], phase: Phase): PlayerState[] {
  return [...players].sort((a, b) => {
    const elapsedA = phase === "results" ? ROUND_DURATION : (a.lastTypedAt ?? 0);
    const elapsedB = phase === "results" ? ROUND_DURATION : (b.lastTypedAt ?? 0);
    return wertung(b.correct, b.errors, elapsedB) - wertung(a.correct, a.errors, elapsedA);
  });
}

export function toSnapshot(state: GameState): Snapshot {
  const ordered =
    state.phase === "round" || state.phase === "results"
      ? rankPlayers(state.players, state.phase)
      : state.players;
  return {
    phase: state.phase,
    players: ordered.map((p) => {
      const elapsed = state.phase === "results" ? ROUND_DURATION : (p.lastTypedAt ?? 0);
      return {
        id: p.id,
        nickname: p.nickname,
        correct: p.correct,
        errors: p.errors,
        total: p.correct + p.errors,
        cursor: p.cursor,
        wertung: elapsed > 0 ? wertung(p.correct, p.errors, elapsed) : 0,
        typingElapsed: p.lastTypedAt ?? 0,
      };
    }),
    spectators: state.spectators.map((s) => ({ id: s.id, nickname: s.nickname })),
    text: state.text,
    timeRemaining: state.timeRemaining,
    winnerId: state.winnerId,
    roundNumber: state.roundNumber,
  };
}
