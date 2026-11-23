import { DEFAULT_OPTIONS, type LoadTestOptions, type ScenarioResult } from "./types.js";
import { runScenario } from "./scenario.js";
import { writeReport } from "./report.js";

/** Merge environment overrides over the defaults. */
function parseOptions(): LoadTestOptions {
  const opts: LoadTestOptions = { ...DEFAULT_OPTIONS };
  const env = process.env;
  if (env.N_VALUES) {
    opts.nValues = env.N_VALUES.split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  if (env.PORT) opts.port = Number(env.PORT);
  if (env.KEYSTROKE_RATE) opts.keystrokeRate = Number(env.KEYSTROKE_RATE);
  if (env.ERROR_RATE) opts.errorRate = Number(env.ERROR_RATE);
  if (env.SCENARIO_MAX_MS) opts.scenarioMaxMs = Number(env.SCENARIO_MAX_MS);
  if (env.JOIN_STAGGER_MS) opts.joinStaggerMs = Number(env.JOIN_STAGGER_MS);
  if (env.REPORT_PATH) opts.reportPath = env.REPORT_PATH;
  return opts;
}

async function main(): Promise<void> {
  const opts = parseOptions();
  console.log(`type-rush load test`);
  console.log(`  N values:       ${opts.nValues.join(", ")}`);
  console.log(`  port:           ${opts.port}`);
  console.log(`  keystroke rate: ${opts.keystrokeRate}/s`);
  console.log(`  error rate:     ${(opts.errorRate * 100).toFixed(0)}%`);
  console.log(`  scenario max:   ${opts.scenarioMaxMs} ms`);
  console.log(`  join stagger:   ${opts.joinStaggerMs} ms`);

  const results: ScenarioResult[] = [];
  for (const n of opts.nValues) {
    console.log(`\n=== N=${n} ===`);
    const t0 = Date.now();
    const r = await runScenario(n, opts);
    const round = r.phases.round;
    const detail = round
      ? ` · round ack p95=${round.ack.p95.toFixed(1)}ms max=${round.ack.max.toFixed(1)}ms · peak CPU=${round.peakCpuPct.toFixed(1)}% RSS=${round.peakRssMb.toFixed(1)}MB`
      : "";
    console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s · completed=${r.completedRound}${detail}`);
    results.push(r);
  }

  const reportPath =
    opts.reportPath || `reports/loadtest-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
  writeReport(results, reportPath);
  console.log(`\nReport written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
