# TYPE RUSH

A local multiplayer race game for learning touch typing: every player types the same German
text in the browser; the best **score** (speed + key accuracy) wins. No cloud, no accounts,
no installation — one machine on the LAN runs the server and everyone joins via the URL shown
on screen. Wrong keys block (Monkeytype-style); the UI shows a finger hint, the highlighted
next character, a live leaderboard, and your own WPM/accuracy.

## Architecture (TypeScript end-to-end)

| Component | Path | Role |
|---|---|---|
| **Engine** | `src/engine` | Pure, deterministic, event-driven game logic — the *single* test seam. Consumes events, emits state snapshots. |
| **Server** | `src/server` | Thin WebSocket adapter, authoritative (ADR 0001). |
| **Client** | `src/client` | Thin browser SPA (vanilla DOM, no framework). |
| **Content** | `src/content` | Curated German text list + length calibration. |

The server and client are thin adapters around the engine; all game rules live exclusively there.

## Quality assurance

The codebase is checked on several levels:

| Type | Tool | Purpose |
|---|---|---|
| Type checking | TypeScript (`tsc`) | Catches type errors across the codebase |
| Style & formatting | ESLint + Prettier | Enforces consistent code style |
| Unit tests | Vitest | Verifies the engine behaves correctly and enforces a minimum coverage threshold |
| Property-based tests | fast-check | Generates random event sequences to verify the engine stays well-formed and deterministic under arbitrary inputs |
| Change risk | CRAP Score (`@barney-media/crap-typescript-vitest`) | Combines cyclomatic complexity with per-function coverage into a change-risk score; fails the build if any function exceeds the threshold (10) |
| Mutation testing | Stryker | Injects small faults into the engine and content to measure how well the tests catch them; fails the build if the mutation score drops below 70% (`npm run test:mutation`) |
| Pre-commit hook | Husky + lint-staged | Runs lint + format on staged files before each commit |
| Formal model | Quint | Independently verifies the game rules (invariants + reachability) |
