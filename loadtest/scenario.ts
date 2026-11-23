import { ManagedServer, ResourceSampler } from "./server.js";
import { SimulatedUser } from "./client.js";
import { LatencyTracker } from "./latency.js";
import type { LoadTestOptions, Phase, PhaseMetrics, ScenarioResult } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run one load-test scenario for a fixed participant count `n`:
 * spawn a fresh server, connect `n` real WS users (8 players + the rest
 * spectators), let them play through a full lobby→countdown→round→lobby cycle,
 * then tear everything down and aggregate per-phase metrics.
 */
export async function runScenario(n: number, opts: LoadTestOptions): Promise<ScenarioResult> {
  const players = Math.min(n, 8);
  const spectators = n - players;
  const url = `ws://127.0.0.1:${opts.port}`;

  const server = new ManagedServer(opts.port);
  await server.start();

  // Global phase tracking, driven by the reference user (users[0], a player).
  let globalPhase: Phase = "lobby";
  const timeline: { phase: Phase; startMs: number }[] = [];
  let completedRound = false;
  const onPhase = (phase: Phase) => {
    if (phase === "lobby" && globalPhase === "round") completedRound = true;
    timeline.push({ phase, startMs: Date.now() });
    globalPhase = phase;
  };

  const users: SimulatedUser[] = [];
  for (let i = 0; i < n; i++) {
    users.push(
      new SimulatedUser({
        url,
        nickname: `user-${i}`,
        isPlayer: i < players,
        keystrokeRate: opts.keystrokeRate,
        errorRate: opts.errorRate,
        onPhase: i === 0 ? onPhase : undefined,
      }),
    );
  }

  // Start sampling as soon as the server is up, so the join storm is captured.
  const sampler = new ResourceSampler(server.pid, () => globalPhase, 500);
  sampler.start();

  // Connect all users, staggered over joinStaggerMs (the join storm).
  const stagger = n > 1 ? opts.joinStaggerMs / (n - 1) : 0;
  let lobbyStart = Date.now();
  for (let i = 0; i < n; i++) {
    if (i > 0 && stagger > 0) await sleep(stagger);
    if (i === 0) lobbyStart = Date.now();
    await users[i].connect();
  }
  timeline.unshift({ phase: "lobby", startMs: lobbyStart });

  // Players sign up → roster fills to 8 → immediate countdown.
  for (const u of users) if (u.opts.isPlayer) u.signUp();

  const scenarioStart = Date.now();
  while (!completedRound && Date.now() - scenarioStart < opts.scenarioMaxMs) {
    await sleep(100);
  }
  const scenarioEnd = Date.now();

  // Tear down: stop sampling, close users, kill the server, wait for the port.
  sampler.stop();
  for (const u of users) u.stop();
  server.kill();
  await server.waitExit();
  await sleep(200);

  // Per-phase wall-clock durations from the reference user's phase timeline.
  const durations = new Map<Phase, number>();
  for (let i = 0; i < timeline.length; i++) {
    const end = i + 1 < timeline.length ? timeline[i + 1].startMs : scenarioEnd;
    durations.set(timeline[i].phase, (durations.get(timeline[i].phase) ?? 0) + (end - timeline[i].startMs));
  }

  const phases: Partial<Record<Phase, PhaseMetrics>> = {};
  for (const phase of ["lobby", "countdown", "round"] as Phase[]) {
    const durationMs = durations.get(phase);
    if (!durationMs) continue;
    phases[phase] = aggregatePhase(phase, users, n, durationMs, sampler);
  }

  const overall = { peakCpuPct: 0, peakRssMb: 0 };
  for (const v of sampler.collect().values()) {
    overall.peakCpuPct = Math.max(overall.peakCpuPct, v.peakCpuPct);
    overall.peakRssMb = Math.max(overall.peakRssMb, v.peakRssMb);
  }

  return {
    n,
    players,
    spectators,
    phases,
    totalDurationMs: scenarioEnd - scenarioStart,
    completedRound,
    peakCpuPct: overall.peakCpuPct,
    peakRssMb: overall.peakRssMb,
  };
}

/** Aggregate one phase's metrics across all users of a scenario. */
function aggregatePhase(
  phase: Phase,
  users: SimulatedUser[],
  userCount: number,
  durationMs: number,
  sampler: ResourceSampler,
): PhaseMetrics {
  const ack = new LatencyTracker();
  let snapshotsTotal = 0;
  let messagesTotal = 0;
  let byteSum = 0;
  let byteMax = 0;
  let byteCount = 0;
  for (const u of users) {
    const b = u.collect().get(phase);
    if (!b) continue;
    for (const a of b.ack) ack.add(a);
    snapshotsTotal += b.snapshots;
    messagesTotal += b.messages;
    for (const by of b.bytes) {
      byteSum += by;
      if (by > byteMax) byteMax = by;
      byteCount++;
    }
  }
  const res = sampler.collect().get(phase) ?? { peakCpuPct: 0, peakRssMb: 0 };
  // Per-user average receive rate = the server's broadcast cadence (events/s).
  const snapshotsPerSec = durationMs > 0 ? snapshotsTotal / userCount / (durationMs / 1000) : 0;
  return {
    phase,
    durationMs,
    ack: ack.compute(),
    snapshotsPerSec,
    snapshotsTotal,
    messagesTotal,
    avgSnapshotChars: byteCount > 0 ? byteSum / byteCount : 0,
    maxSnapshotChars: byteMax,
    peakCpuPct: res.peakCpuPct,
    peakRssMb: res.peakRssMb,
  };
}
