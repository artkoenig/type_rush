import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ScenarioResult } from "./types.js";

const PHASES = ["lobby", "countdown", "round"] as const;

function fmtMs(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(1)}ms`;
}
function fmtNum(v: number, d = 1): string {
  return Number.isFinite(v) ? v.toFixed(d) : "—";
}
function fmtInt(v: number): string {
  return Number.isFinite(v) ? String(Math.round(v)) : "—";
}

/** Write the full markdown report for a set of scenario results. */
export function writeReport(results: ScenarioResult[], path: string): void {
  const L: string[] = [];
  L.push(`# type-rush Load Test`);
  L.push("");
  L.push(`Generated: ${new Date().toISOString()}`);
  L.push("");
  L.push(`Participant counts: ${results.map((r) => r.n).join(", ")}`);
  L.push("");
  L.push(
    `Each scenario spawns a fresh server and connects N real WebSocket users (8 players + N-8 spectators). ` +
      `Players type during the round; the server broadcasts a full snapshot to **all** N users on every event. ` +
      `Latency is measured from a user's send until the next snapshot that reflects it.`,
  );
  L.push("");

  // ---- Summary table ----
  L.push(`## Summary`);
  L.push("");
  L.push(
    `| N | players | spectators | round ack p50 | round ack p95 | round ack max | round snapshots/s | round peak CPU% | round peak RSS | completed |`,
  );
  L.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of results) {
    const round = r.phases.round;
    L.push(
      `| ${r.n} | ${r.players} | ${r.spectators} | ` +
        (round ? fmtMs(round.ack.p50) : "—") + ` | ` +
        (round ? fmtMs(round.ack.p95) : "—") + ` | ` +
        (round ? fmtMs(round.ack.max) : "—") + ` | ` +
        (round ? fmtNum(round.snapshotsPerSec) : "—") + ` | ` +
        (round ? fmtNum(round.peakCpuPct) : "—") + ` | ` +
        (round ? `${fmtNum(round.peakRssMb)} MB` : "—") + ` | ` +
        (r.completedRound ? "yes" : "no") + ` |`,
    );
  }
  L.push("");

  // ---- Per-N detail ----
  for (const r of results) {
    L.push(`## N = ${r.n} (${r.players} players, ${r.spectators} spectators)`);
    L.push("");
    L.push(
      `Total scenario duration: ${fmtMs(r.totalDurationMs)} · completed round: ${r.completedRound ? "yes" : "no"} · ` +
        `peak CPU ${fmtNum(r.peakCpuPct)}% · peak RSS ${fmtNum(r.peakRssMb)} MB`,
    );
    L.push("");
    L.push(
      `| phase | duration | ack p50 | ack p95 | ack p99 | ack max | ack n | snapshots/s | snapshots | messages | avg chars | max chars | peak CPU% | peak RSS |`,
    );
    L.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
    for (const phase of PHASES) {
      const m = r.phases[phase];
      if (!m) continue;
      L.push(
        `| ${phase} | ${fmtMs(m.durationMs)} | ${fmtMs(m.ack.p50)} | ${fmtMs(m.ack.p95)} | ${fmtMs(m.ack.p99)} | ${fmtMs(m.ack.max)} | ` +
          `${m.ack.count} | ${fmtNum(m.snapshotsPerSec)} | ${fmtInt(m.snapshotsTotal)} | ${fmtInt(m.messagesTotal)} | ` +
          `${fmtInt(m.avgSnapshotChars)} | ${fmtInt(m.maxSnapshotChars)} | ${fmtNum(m.peakCpuPct)} | ${fmtNum(m.peakRssMb)} MB |`,
      );
    }
    L.push("");
  }

  // ---- Trends ----
  L.push(`## Trends`);
  L.push("");
  L.push(trendsNote(results));
  L.push("");

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, L.join("\n"));
}

/** A short prose summary of how the round-phase metrics scale with N. */
function trendsNote(results: ScenarioResult[]): string {
  const withRound = results.filter((r) => r.phases.round);
  if (withRound.length < 2) return "Not enough data to describe trends.";
  const first = withRound[0].phases.round!;
  const last = withRound[withRound.length - 1].phases.round!;
  const n0 = withRound[0].n;
  const n1 = withRound[withRound.length - 1].n;
  const p95x = first.ack.p95 > 0 ? last.ack.p95 / first.ack.p95 : 0;
  const cpux = first.peakCpuPct > 0 ? last.peakCpuPct / first.peakCpuPct : 0;
  const sizeX = first.avgSnapshotChars > 0 ? last.avgSnapshotChars / first.avgSnapshotChars : 0;
  return [
    `Round phase, from N=${n0} to N=${n1}:`,
    `- ack p95: ${fmtMs(first.ack.p95)} → ${fmtMs(last.ack.p95)} (${p95x.toFixed(1)}×)`,
    `- ack max: ${fmtMs(first.ack.max)} → ${fmtMs(last.ack.max)}`,
    `- peak CPU: ${fmtNum(first.peakCpuPct)}% → ${fmtNum(last.peakCpuPct)}% (${cpux.toFixed(1)}×)`,
    `- peak RSS: ${fmtNum(first.peakRssMb)} MB → ${fmtNum(last.peakRssMb)} MB`,
    `- snapshot size (avg): ${fmtInt(first.avgSnapshotChars)} → ${fmtInt(last.avgSnapshotChars)} chars (${sizeX.toFixed(1)}×)`,
  ].join("\n");
}
