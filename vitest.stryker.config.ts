import { defineConfig } from "vitest/config";

/**
 * Dedicated Vitest config for Stryker mutation testing.
 *
 * It deliberately does NOT use `withCrapTypescriptVitest` (see `vitest.config.ts`):
 * Stryker re-runs the suite many times per mutant, and the CRAP coverage gate would
 * add overhead and noise to every run. Mutation testing is scoped to the pure logic
 * (engine + content) — the single test seam — which is where the change risk lives.
 */
export default defineConfig({
  test: {
    include: ["src/engine/**/*.test.ts", "src/content/**/*.test.ts"],
    environment: "node",
  },
});
