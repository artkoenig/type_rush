# 01: Scaffolding

**What to build:** A working TypeScript project skeleton: package.json with build and test scripts, tsconfig, Vitest as test runner, and the directory layout for engine, server, frontend, and content modules. Running `npm test` with a trivial passing test confirms the toolchain works end-to-end.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] `npm install` succeeds; `npm run build` compiles TypeScript without errors
- [ ] `npm test` runs Vitest and passes a trivial smoke test
- [ ] Directory structure exists: `src/engine/`, `src/server/`, `src/frontend/`, `src/content/`
- [ ] tsconfig targets ES2022, strict mode, appropriate module resolution for both Node (server) and browser (frontend)
