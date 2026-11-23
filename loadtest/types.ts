/** Game phases, mirroring the engine's `Phase`. */
export type Phase = "lobby" | "countdown" | "round";

export const PHASES: readonly Phase[] = ["lobby", "countdown", "round"];

/** Per-phase metric buckets accumulated by a single simulated user. */
export interface PhaseBucket {
  /** Round-trip latency samples (ms): time from a send until the snapshot that reflects it. */
  ack: number[];
  /** Number of snapshots received while in this phase. */
  snapshots: number;
  /** Snapshot payload sizes (chars) received while in this phase. */
  bytes: number[];
  /** Time between consecutive snapshots (ms), for broadcast cadence. */
  cadence: number[];
  /** Number of messages this user sent while in this phase. */
  messages: number;
}

/** Aggregated metrics for one phase of one scenario, across all users. */
export interface PhaseMetrics {
  phase: Phase;
  /** How long this phase was observed (ms), from the reference user. */
  durationMs: number;
  ack: LatencyStats;
  /** Server broadcast rate (snapshots/s) while in this phase, averaged over users. */
  snapshotsPerSec: number;
  /** Total snapshots received by all users in this phase. */
  snapshotsTotal: number;
  /** Total messages sent by all users in this phase. */
  messagesTotal: number;
  avgSnapshotChars: number;
  maxSnapshotChars: number;
  peakCpuPct: number;
  peakRssMb: number;
}

/** Result of one load-test scenario (a fixed participant count N). */
export interface ScenarioResult {
  n: number;
  players: number;
  spectators: number;
  phases: Partial<Record<Phase, PhaseMetrics>>;
  totalDurationMs: number;
  /** Whether a full lobby→countdown→round→lobby cycle was observed. */
  completedRound: boolean;
  peakCpuPct: number;
  peakRssMb: number;
}

/** Configuration for a load-test run. */
export interface LoadTestOptions {
  /** Participant counts to sweep. */
  nValues: number[];
  /** Port the (spawned) server listens on. */
  port: number;
  /** Keystrokes per second each player emits during a round. */
  keystrokeRate: number;
  /** Fraction of keystrokes that are wrong (blocking errors). */
  errorRate: number;
  /** Hard cap per scenario (ms). */
  scenarioMaxMs: number;
  /** Window over which the N joins are spread (ms) — the join storm. */
  joinStaggerMs: number;
  /** Where to write the markdown report. */
  reportPath: string;
}

export const DEFAULT_OPTIONS: LoadTestOptions = {
  nValues: [10, 25, 50, 100, 200],
  port: 3100,
  keystrokeRate: 10,
  errorRate: 0.1,
  scenarioMaxMs: 120_000,
  joinStaggerMs: 1000,
  reportPath: "",
};

/** Summary of a set of latency samples (ms). */
export interface LatencyStats {
  count: number;
  min: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}
