import { spawn, execSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Phase } from "./types.js";

/** The project root (this file lives in `loadtest/`). */
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Spawns the real game server as a child process on a given port and waits
 * until it reports ready. One instance per scenario (fresh game state).
 */
export class ManagedServer {
  private proc: ChildProcess | null = null;
  private stderr = "";

  constructor(readonly port: number) {}

  get pid(): number {
    return this.proc?.pid ?? -1;
  }

  /** Spawn the server; resolve once it is listening, reject on failure/timeout. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn("node", ["--import", "tsx", "src/server/index.ts"], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, PORT: String(this.port) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.proc = proc;

      let stdout = "";
      let settled = false;
      const finish = (ok: boolean, err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (ok) resolve();
        else reject(err ?? new Error("server failed to start"));
      };

      const timeout = setTimeout(() => {
        this.kill();
        finish(false, new Error(`server not ready on port ${this.port} in time. stderr:\n${this.stderr}`));
      }, 20_000);
      timeout.unref?.();

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes("type-rush: open")) finish(true);
      });
      proc.stderr?.on("data", (chunk: Buffer) => {
        this.stderr += chunk.toString();
      });
      proc.on("error", (err) => finish(false, err));
      proc.on("exit", (code) => {
        if (!settled) finish(false, new Error(`server exited early (code ${code}). stderr:\n${this.stderr}`));
      });
    });
  }

  /** Send SIGTERM (escalating to SIGKILL) without detaching the handle. */
  kill(): void {
    const proc = this.proc;
    if (!proc || proc.exitCode !== null) return;
    try {
      proc.kill("SIGTERM");
      const t = setTimeout(() => {
        if (proc.exitCode === null) proc.kill("SIGKILL");
      }, 1_500);
      t.unref?.();
    } catch {
      /* already gone */
    }
  }

  /** Resolve once the child has actually exited (so the port is free). */
  waitExit(timeoutMs = 5_000): Promise<void> {
    return new Promise((resolve) => {
      const proc = this.proc;
      if (!proc || proc.exitCode !== null) {
        resolve();
        return;
      }
      const t = setTimeout(() => resolve(), timeoutMs);
      t.unref?.();
      proc.on("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}

/** Per-phase resource peaks collected by the sampler. */
export interface PhaseResources {
  peakCpuPct: number;
  peakRssMb: number;
}

/**
 * Samples a process's CPU% and RSS on an interval and buckets each sample by the
 * current game phase (supplied by the caller). CPU% = Δcputime / Δwall.
 */
export class ResourceSampler {
  private timer: NodeJS.Timeout | null = null;
  private lastCpuTime: number | null = null;
  private lastWall: number | null = null;
  private peaks = new Map<Phase, PhaseResources>();

  constructor(
    private pid: number,
    private phaseOf: () => Phase,
    private intervalMs = 500,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sample(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  collect(): Map<Phase, PhaseResources> {
    return this.peaks;
  }

  private sample(): void {
    let out: string;
    try {
      out = execSync(`ps -o cputime=,rss= -p ${this.pid}`, {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      return; // process gone
    }
    if (!out) return;
    const [cpuField, rssField] = out.split(/\s+/);
    if (!cpuField || !rssField) return;
    const rssKb = Number(rssField);
    if (!Number.isFinite(rssKb)) return;

    const wall = Date.now();
    const cpuTime = parseCpuTime(cpuField);
    let cpuPct = 0;
    if (this.lastCpuTime !== null && this.lastWall !== null) {
      const dWall = (wall - this.lastWall) / 1000;
      if (dWall > 0) cpuPct = Math.min(100, ((cpuTime - this.lastCpuTime) / dWall) * 100);
    }
    this.lastCpuTime = cpuTime;
    this.lastWall = wall;

    const rssMb = rssKb / 1024;
    const phase = this.phaseOf();
    const cur = this.peaks.get(phase) ?? { peakCpuPct: 0, peakRssMb: 0 };
    cur.peakCpuPct = Math.max(cur.peakCpuPct, cpuPct);
    cur.peakRssMb = Math.max(cur.peakRssMb, rssMb);
    this.peaks.set(phase, cur);
  }
}

/** Parse a `ps` cputime field (`MM:SS.cc` or `H:MM:SS.cc`) into seconds. */
function parseCpuTime(field: string): number {
  const parts = field.split(":");
  const last = parseFloat(parts[parts.length - 1]);
  if (parts.length === 2) return Number(parts[0]) * 60 + last;
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + last;
  return last;
}
