import { calibrateText, type Duration } from "../content/textPool";

/**
 * Phase cycle (hostless, auto-starting): lobby → countdown → round → lobby → …
 *
 * There is NO separate "results" phase. The highscore table ("results") is a
 * client-side view over the lobby, backed by `lastRoundResults`. After every round
 * all players become spectators and the game returns to the lobby on its own; each
 * spectator then decides whether to sign up for the next round or keep watching.
 */
export type Phase = "lobby" | "countdown" | "round";

/** Fixed phase durations, in seconds. */
export const LOBBY_DURATION = 30;
export const COUNTDOWN_DURATION = 5;
export const ROUND_DURATION = 60;

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
  /** Active players (the racing roster) of the current round. */
  players: PlayerState[];
  /** Spectators: joined but not in the current roster. Includes former players. */
  spectators: SpectatorState[];
  /**
   * The highscore table: the players of the most recently ENDED round, with their
   * final scores. Fixed (it does not shrink when people leave the lobby); present
   * only in the lobby and cleared when the next game starts. Backs the client-side
   * "results" view over the lobby.
   */
  lastRoundResults: PlayerState[];
  /** Text all players type in the current round. */
  text: string;
  /** Seconds left in the current phase (30 lobby / 5 countdown / 60 round). */
  timeRemaining: number;
  /** Player with the highest final Wertung (null if none). Lobby-only. */
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
  /** The racing roster (ordered by Wertung in a round; join order otherwise). */
  players: PlayerSnapshot[];
  /** Spectators watching (not in the current roster). */
  spectators: SpectatorSnapshot[];
  /**
   * The highscore table of the last round, ranked by final Wertung. Empty outside
   * the lobby. Backs the client-side "results" view over the lobby.
   */
  lastRoundResults: PlayerSnapshot[];
  text: string;
  timeRemaining: number;
  winnerId: string | null;
  roundNumber: number;
}

export interface StepResult {
  newState: GameState;
  snapshots: Snapshot[];
}

/**
 * Wertung = Tempo × Genauigkeit² = (correct / elapsed) · 60 · (correct / total)².
 *
 * - `(correct / elapsed) · 60` = Zeichen pro Minute (Tempo).
 * - `(correct / total)²` = Tasten-Genauigkeit, quadratisch gewichtet (Fehler senken den Score).
 * - Bei perfekter Genauigkeit (errors = 0) ist der Score exakt die Zeichen-pro-Minute.
 * - `elapsed` = Zeit bis zum letzten Tastendruck (eingefroren) bzw. Runden-Dauer; Idle-Zeit
 *   zählt nie gegen. 0, wenn noch keine Taste gedrückt wurde.
 *
 * Deterministisch: gleiche Eingaben → gleicher ganzzahliger Score (Math.floor).
 */
export function wertung(correct: number, errors: number, elapsedSec: number): number {
  const total = correct + errors;
  if (total === 0 || elapsedSec <= 0) return 0;
  const tempo = (correct / elapsedSec) * 60; // Zeichen pro Minute
  const accuracy = correct / total; // 0…1
  return Math.floor(tempo * accuracy ** 2);
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
    lastRoundResults: [],
    text: "",
    timeRemaining: LOBBY_DURATION,
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
  rng: () => number = Math.random,
): StepResult {
  const next = apply(state, event, rng);
  if (next === null) return { newState: state, snapshots: [] };
  return { newState: next, snapshots: [toSnapshot(next)] };
}

function apply(state: GameState, event: GameEvent, rng: () => number): GameState | null {
  switch (event.type) {
    case "join":
      return handleJoin(state, event);
    case "signUp":
      return settle(handleSignUp(state, event), rng);
    case "keystroke":
      return settle(handleKeystroke(state, event), rng);
    case "tick":
      return handleTick(state, rng);
    case "disconnect":
      return settle(handleDisconnect(state, event), rng);
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
 * transition the new value triggers. In the lobby the timer runs only once at least
 * one player has signed up; in the countdown and round it runs while any time remains.
 */
function handleTick(state: GameState, rng: () => number): GameState | null {
  if (!isTimerRunning(state)) return null;
  return settle({ ...state, timeRemaining: state.timeRemaining - 1 }, rng);
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
 * leaves it is cleared. In the lobby, if the roster becomes empty, the 30s
 * participation timer is reloaded.
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
    winnerId: state.winnerId === event.playerId ? null : state.winnerId,
    timeRemaining: lobbyTimer(state, players),
  };
}

/** Reloads the 30s lobby timer when the roster becomes empty; otherwise keeps it. */
function lobbyTimer(state: GameState, players: PlayerState[]): number {
  return state.phase === "lobby" && players.length === 0 ? LOBBY_DURATION : state.timeRemaining;
}

/**
 * Applies the phase transitions the current state triggers, cascading until stable:
 * lobby → countdown, countdown → round, round → lobby. Each rule returns the same state
 * object when it does not fire, which stops the cascade.
 */
function settle(state: GameState | null, rng: () => number): GameState | null {
  if (state === null) return null;
  let s = state;
  for (let i = 0; i < 8; i++) {
    const next = transition(s, rng);
    if (next === s) break; // stable: no transition fired
    s = next;
  }
  return s;
}

/** The single transition a state can make right now, or the same state if none applies. */
function transition(state: GameState, rng: () => number): GameState {
  if (state.phase === "lobby") return settleLobby(state);
  if (state.phase === "countdown") return settleCountdown(state, rng);
  if (state.phase === "round") return settleRound(state);
  return state;
}

/**
 * Lobby → countdown when the roster is full, or the timer hits 0 with 2+ players.
 * A 0-timer with fewer than 2 players just reloads the lobby timer (still waiting).
 * The highscore table and the winner are cleared (both are lobby phenomena).
 */
function settleLobby(state: GameState): GameState {
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
      lastRoundResults: [],
      winnerId: null,
    };
  }
  return state;
}

/** Countdown → round when the timer hits 0: pick a text, reset counters, increment the round. */
function settleCountdown(state: GameState, rng: () => number): GameState {
  if (state.timeRemaining !== 0) return state;
  return {
    ...state,
    phase: "round",
    timeRemaining: ROUND_DURATION,
    text: calibrateText(ROUND_DURATION as Duration, rng),
    roundNumber: state.roundNumber + 1,
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

/**
 * Round → lobby when the timer hits 0 or every player has finished the text.
 * All players become spectators again; their final scores become the highscore table
 * (`lastRoundResults`); the roster empties; the 30s participation timer is reloaded.
 */
function settleRound(state: GameState): GameState {
  const allFinished =
    state.players.length > 0 && state.players.every((p) => p.cursor >= state.text.length);
  if (state.timeRemaining !== 0 && !allFinished) return state;
  const ranked = rankByWertung(state.players, true);
  const winner = ranked.length > 0 ? ranked[0] : null;
  return {
    ...state,
    phase: "lobby",
    players: [],
    spectators: [
      ...state.spectators,
      ...state.players.map((p) => ({ id: p.id, nickname: p.nickname })),
    ],
    lastRoundResults: state.players,
    winnerId: winner?.id ?? null,
    timeRemaining: LOBBY_DURATION,
  };
}

/**
 * Players ordered by Wertung (descending); ties keep join order. With
 * `useFullDuration` the full round duration is used as elapsed (the round is over);
 * otherwise each player's own lastTypedAt (frozen at their last keystroke) is used.
 */
function rankByWertung(players: readonly PlayerState[], useFullDuration: boolean): PlayerState[] {
  return [...players].sort((a, b) => {
    const elapsedA = useFullDuration ? ROUND_DURATION : (a.lastTypedAt ?? 0);
    const elapsedB = useFullDuration ? ROUND_DURATION : (b.lastTypedAt ?? 0);
    return wertung(b.correct, b.errors, elapsedB) - wertung(a.correct, a.errors, elapsedA);
  });
}

export function toSnapshot(state: GameState): Snapshot {
  const players = state.phase === "round" ? rankByWertung(state.players, false) : state.players;
  const lastRoundResults = rankByWertung(state.lastRoundResults, true);
  return {
    phase: state.phase,
    players: players.map((p) => {
      const elapsed = state.phase === "round" ? (p.lastTypedAt ?? 0) : 0;
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
    lastRoundResults: lastRoundResults.map((p) => {
      const elapsed = ROUND_DURATION; // the round is over
      return {
        id: p.id,
        nickname: p.nickname,
        correct: p.correct,
        errors: p.errors,
        total: p.correct + p.errors,
        cursor: p.cursor,
        wertung: wertung(p.correct, p.errors, elapsed),
        typingElapsed: ROUND_DURATION,
      };
    }),
    text: state.text,
    timeRemaining: state.timeRemaining,
    winnerId: state.winnerId,
    roundNumber: state.roundNumber,
  };
}
