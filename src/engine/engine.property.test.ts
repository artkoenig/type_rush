import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MAX_PLAYERS,
  ROUND_DURATION,
  createGame,
  step,
  wertung,
  type GameEvent,
  type GameState,
  type Snapshot,
} from "./engine";

/**
 * Property-based tests for the engine (the single test seam).
 *
 * The engine is pure and deterministic: it consumes events and emits state
 * snapshots. Instead of only checking hand-picked scenarios (see
 * `engine.test.ts`), these properties drive the engine with *random* event
 * sequences and assert *invariants* that must hold for every reachable state.
 * This catches whole classes of bugs (off-by-one timers, roster overflow,
 * cursor drift, NaN scores) that example-based tests miss.
 *
 * Pairs with the Quint model: Quint verifies the rules at the *spec* level,
 * fast-check verifies them at the *code* level — two independent proofs.
 */

const PHASES = ["lobby", "countdown", "round"] as const;

/**
 * Deterministic PRNG (mulberry32). A fixed seed yields a reproducible round-text
 * pick, which is what makes the determinism property below checkable.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Arbitraries -----------------------------------------------------------

/** Bounded pool of player ids so events reference a realistic, overlapping set. */
const playerIdArb = fc.integer({ min: 0, max: MAX_PLAYERS + 3 }).map((i) => `p${i}`);

const nicknameArb = fc.string({ minLength: 1, maxLength: 12 });

/**
 * A keystroke key: 0–3 characters from a realistic QWERTZ set. Length 0 and >1
 * are malformed on purpose — the engine must ignore them, never crash.
 */
const keyArb = fc.string({
  unit: fc.constantFrom(..."abcdeäöüß0123456789 .,;".split("")),
  minLength: 0,
  maxLength: 3,
});

const joinArb: fc.Arbitrary<GameEvent> = fc.record({
  type: fc.constant("join" as const),
  playerId: playerIdArb,
  nickname: nicknameArb,
});
const signUpArb: fc.Arbitrary<GameEvent> = fc.record({
  type: fc.constant("signUp" as const),
  playerId: playerIdArb,
});
const keystrokeArb: fc.Arbitrary<GameEvent> = fc.record({
  type: fc.constant("keystroke" as const),
  playerId: playerIdArb,
  key: keyArb,
});
const tickArb: fc.Arbitrary<GameEvent> = fc.constant<GameEvent>({ type: "tick" });
const disconnectArb: fc.Arbitrary<GameEvent> = fc.record({
  type: fc.constant("disconnect" as const),
  playerId: playerIdArb,
});

/**
 * A weighted mix of events (fast-check 4.x has no `fc.frequency`, so the weights
 * are realised by bucketing a uniform integer). Ticks are favoured so that rounds
 * actually start and usually finish within a sequence, exercising the full
 * lobby→countdown→round→lobby cycle; joins/signUps populate the roster; a few
 * disconnects test churn. Weights: tick 4, keystroke 3, join 2, signUp 2,
 * disconnect 1 (12 buckets).
 */
const eventArb: fc.Arbitrary<GameEvent> = fc.integer({ min: 0, max: 11 }).chain((bucket) => {
  if (bucket < 4) return tickArb;
  if (bucket < 7) return keystrokeArb;
  if (bucket < 9) return joinArb;
  if (bucket < 11) return signUpArb;
  return disconnectArb;
});

// --- Invariant checkers ----------------------------------------------------

/** Structural invariants that must hold for every reachable game state. */
function assertWellFormedState(state: GameState): void {
  expect(PHASES).toContain(state.phase);
  expect(Number.isInteger(state.timeRemaining)).toBe(true);
  expect(state.timeRemaining).toBeGreaterThanOrEqual(0);
  expect(state.players.length).toBeLessThanOrEqual(MAX_PLAYERS);
  expect(Number.isInteger(state.roundNumber)).toBe(true);
  expect(state.roundNumber).toBeGreaterThanOrEqual(0);

  const playerIds = state.players.map((p) => p.id);
  const spectatorIds = state.spectators.map((s) => s.id);
  // No duplicate ids within a list…
  expect(new Set(playerIds).size).toBe(playerIds.length);
  expect(new Set(spectatorIds).size).toBe(spectatorIds.length);
  // …and a participant is in exactly one of players/spectators.
  for (const id of playerIds) expect(spectatorIds).not.toContain(id);

  for (const p of state.players) {
    expect(Number.isInteger(p.correct)).toBe(true);
    expect(Number.isInteger(p.errors)).toBe(true);
    expect(p.correct).toBeGreaterThanOrEqual(0);
    expect(p.errors).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(p.cursor)).toBe(true);
    expect(p.cursor).toBeGreaterThanOrEqual(0);
    expect(p.cursor).toBeLessThanOrEqual(state.text.length);
    if (p.lastTypedAt !== null) {
      expect(p.lastTypedAt).toBeGreaterThanOrEqual(0);
      expect(p.lastTypedAt).toBeLessThanOrEqual(ROUND_DURATION);
    }
  }

  // The highscore table is a lobby-only phenomenon.
  if (state.phase !== "lobby") expect(state.lastRoundResults.length).toBe(0);

  // A winner (if any) still references a known participant (players ∪ spectators).
  if (state.winnerId !== null) {
    const known = new Set([...playerIds, ...spectatorIds]);
    expect(known.has(state.winnerId)).toBe(true);
  }
}

/** Invariants that must hold for every emitted snapshot. */
function assertValidSnapshot(snap: Snapshot): void {
  expect(PHASES).toContain(snap.phase);
  expect(snap.timeRemaining).toBeGreaterThanOrEqual(0);
  // The countdown word is present exactly in the countdown phase.
  expect(snap.countdownWord !== null).toBe(snap.phase === "countdown");

  for (const p of snap.players) {
    expect(p.total).toBe(p.correct + p.errors);
    expect(p.wertung).toBeGreaterThanOrEqual(0);
    expect(p.typingElapsed).toBeGreaterThanOrEqual(0);
    expect(p.cursor).toBeLessThanOrEqual(snap.text.length);
  }
  // In a round the roster is ranked by Wertung (non-increasing).
  if (snap.phase === "round") {
    for (let i = 1; i < snap.players.length; i++) {
      expect(snap.players[i - 1].wertung).toBeGreaterThanOrEqual(snap.players[i].wertung);
    }
  }
  // The highscore table is always ranked by final Wertung (non-increasing).
  for (let i = 1; i < snap.lastRoundResults.length; i++) {
    expect(snap.lastRoundResults[i - 1].wertung).toBeGreaterThanOrEqual(
      snap.lastRoundResults[i].wertung,
    );
  }
  if (snap.phase !== "lobby") expect(snap.lastRoundResults.length).toBe(0);
}

// --- Properties ------------------------------------------------------------

describe("engine (property-based)", () => {
  it("stays well-formed under any sequence of events (no crash, invariants hold at every step)", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 200 }), (events) => {
        let state = createGame();
        assertWellFormedState(state);
        for (const event of events) {
          const result = step(state, event);
          state = result.newState;
          assertWellFormedState(state);
          for (const snap of result.snapshots) assertValidSnapshot(snap);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("is deterministic: the same events with the same seed yield identical state and snapshots", () => {
    fc.assert(
      fc.property(
        fc.array(eventArb, { maxLength: 200 }),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        (events, seed) => {
          const runOnce = () => {
            let state = createGame();
            const rng = mulberry32(seed);
            const snapshots: Snapshot[] = [];
            for (const event of events) {
              const result = step(state, event, rng);
              state = result.newState;
              snapshots.push(...result.snapshots);
            }
            return { state, snapshots };
          };
          const a = runOnce();
          const b = runOnce();
          expect(a.state).toEqual(b.state);
          expect(a.snapshots).toEqual(b.snapshots);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("wertung is non-negative, zero when idle, and never exceeds chars-per-minute", () => {
    fc.assert(
      fc.property(fc.nat(1000), fc.nat(1000), fc.nat(3600), (correct, errors, elapsedSec) => {
        const score = wertung(correct, errors, elapsedSec);
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        if (correct + errors === 0 || elapsedSec <= 0) {
          expect(score).toBe(0);
        } else {
          // accuracy² ≤ 1, so the score is bounded by the raw tempo (chars/min).
          const tempo = (correct / elapsedSec) * 60;
          expect(score).toBeLessThanOrEqual(Math.floor(tempo));
        }
      }),
      { numRuns: 500 },
    );
  });

  it("wertung rewards technique: at equal speed, fewer errors never lower the score", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // correct (non-trivial)
        fc.integer({ min: 1, max: 3600 }), // elapsed
        fc.nat(1000), // errors, variant 1
        fc.nat(1000), // errors, variant 2
        (correct, elapsed, e1, e2) => {
          const [fewer, more] = e1 <= e2 ? [e1, e2] : [e2, e1];
          expect(wertung(correct, fewer, elapsed)).toBeGreaterThanOrEqual(
            wertung(correct, more, elapsed),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it("wertung rewards speed: with perfect accuracy, more characters in the same time scores higher", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 3600 }),
        (c1, c2, elapsed) => {
          const [fewer, more] = c1 <= c2 ? [c1, c2] : [c2, c1];
          expect(wertung(fewer, 0, elapsed)).toBeLessThanOrEqual(wertung(more, 0, elapsed));
        },
      ),
      { numRuns: 500 },
    );
  });
});
