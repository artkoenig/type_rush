import type { LatencyStats } from "./types.js";

/**
 * Accumulates latency samples and computes summary statistics (min/avg/max +
 * percentiles). Pure and allocation-light on `add`.
 */
export class LatencyTracker {
  private samples: number[] = [];

  add(valueMs: number): void {
    this.samples.push(valueMs);
  }

  /** Merge another tracker's samples into this one (used to aggregate across users). */
  merge(other: LatencyTracker): void {
    if (other.samples.length > 0) this.samples.push(...other.samples);
  }

  get count(): number {
    return this.samples.length;
  }

  compute(): LatencyStats {
    const n = this.samples.length;
    if (n === 0) {
      return { count: 0, min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    }
    const s = [...this.samples].sort((a, b) => a - b);
    const sum = s.reduce((acc, v) => acc + v, 0);
    return {
      count: n,
      min: s[0],
      avg: sum / n,
      p50: percentile(s, 50),
      p95: percentile(s, 95),
      p99: percentile(s, 99),
      max: s[n - 1],
    };
  }
}

/** Nearest-rank percentile of a pre-sorted array. */
function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 1) return sorted[0];
  const rank = (pct / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
