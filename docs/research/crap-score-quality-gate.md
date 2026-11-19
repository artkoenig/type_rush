# CRAP Score als Quality Gate

## TL;DR

Es gibt **zwei aktive Tools**, die CRAP Score für TypeScript mit Vitest direkt unterstützen:

| Tool | Ansatz | Threshold | CI-Gate | Vitest |
|------|--------|-----------|---------|--------|
| `@barney-media/crap-typescript` (v0.5.2) | TS-native, Vitest-Adapter + CLI | `--threshold` / Adapter-Option | ✅ Exit-Code + JUnit | ✅ nativ |
| `crap4ts` (breezy-bays-labs) | Rust (napi-rs), zero-config | `crap.toml` + `--threshold` | ✅ Exit-Code | ✅ via Istanbul |

**Empfehlung:** `@barney-media/crap-typescript` – es ist TypeScript-nativ, hat einen dedizierten Vitest-Adapter, und die Threshold-Konfiguration ist direkt in den Adapter eingebaut.

## Was ist CRAP Score?

CRAP = **C**hange **R**isk **A**nti-**P**atterns. Kombiniert zyklomatische Komplexität mit Test-Coverage zu einem einzelnen Risiko-Score pro Funktion.

**Formel** (Original, Savoia & Evans 2007):

```
CRAP(m) = CC(m) + (1 − cov(m)) × CC(m)
       = CC(m) × (2 − cov(m))
```

- `CC(m)` = zyklomatische Komplexität der Funktion
- `cov(m)` = Coverage der Funktion (0…1)

**Interpretation:**

| Coverage | CC | CRAP |
|----------|-----|------|
| 100% | 5 | 5 |
| 100% | 10 | 10 |
| 50% | 10 | 15 |
| 0% | 10 | 20 |
| 0% | 5 | 10 |

> ⚠️ **Threshold 10 ist sehr streng.** Bei 100% Coverage erlaubt es CC ≤ 10 (üblich). Bei 0% Coverage erlaubt es nur CC ≤ 5. Der in der Literatur übliche CRAP-Threshold liegt bei **30** (repowise.dev, MyVar Guide). Mit 10 als Grenze muss praktisch jede Funktion voll getestet sein und darf CC 10 nicht überschreiten.

## Verfügbare Tools

### 1. `@barney-media/crap-typescript` (fabian-barney)

- **Repo:** https://github.com/fabian-barney/crap-typescript
- **npm:** `@barney-media/crap-typescript` (CLI), `@barney-media/crap-typescript-core`, `@barney-media/crap-typescript-vitest`, `@barney-media/crap-typescript-jest`
- **Version:** 2.0.0 (Core), 0.5.2 (CLI)
- **Unterstützt:** Node 22/24/26, Vitest 4/5, Jest
- **Funktionsweise:** Kombiniert zyklomatische Komplexität mit function-level Coverage aus Istanbul Statement- und Branch-Countern
- **Threshold:** `--threshold <N>` (CLI) oder `threshold` in Adapter-Optionen
- **CI-Integration:** Exit-Code ≠ 0 bei Verletzung; JUnit-Report (`coverage/crap-typescript-junit.xml`); `--failures-only` für saubere CI-Logs
- **Output-Formate:** TOON (default, agent-readable), JSON, `--format none`
- **Excludes:** `excludes`, `excludePathRegexes`, `excludeGeneratedMarkers`
- **Maintenance:** Aktiv (GitHub Actions, SemVer, SBOM)

**Beispiel (Vitest-Adapter):**

```ts
// vitest.config.ts
import crap from '@barney-media/crap-typescript-vitest'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // oder 'istanbul'
      reporter: ['text', 'json'],
    },
    // CRAP-Gate: fail wenn CRAP > 10
    crap: {
      threshold: 10,
    },
  },
})
```

**Beispiel (CLI, nach Testlauf):**

```bash
npx vitest run --coverage
npx @barney-media/crap-typescript --threshold 10 --coverage coverage/coverage-final.json
```

### 2. `crap4ts` (breezy-bays-labs)

- **Repo:** https://github.com/breezy-bays-labs/crap4ts
- **npm:** `crap4ts`
- **Ansatz:** Rust-Binary (napi-rs Node-Addon), zero-config
- **Konfiguration:** `crap.toml` (kanonisch) oder `crap4ts.toml` (Legacy)
- **Threshold:** `--threshold <N>` oder in `crap.toml`; `--threshold-epsilon` für Jitter-Abfederung
- **CI:** Liefert Exit-Code, `crap-render` für Multi-Language Reports
- **Coverage-Input:** Istanbul JSON (also kompatibel mit Vitest `--coverage`)
- **Maintenance:** Aktiv (breezy-bays-labs, gemeinsame Basis mit `crap4rs` für Rust)

**Beispiel:**

```bash
# crap.toml
# [threshold]
# value = 10

npx vitest run --coverage
npx crap4ts --threshold 10
```

### 3. `crap-score` (ahilke/js-crap-score)

- **Repo:** https://github.com/ahilke/js-crap-score
- **npm:** `crap-score` (v1.2.1, ~5 Monate alt)
- **Ansatz:** Nimmt Istanbul JSON, erzeugt HTML- + JSON-Report
- **Threshold:** ❌ Kein CI-Gate (nur Visualisierung)
- **Status:** Weniger aktiv, kein Vitest-Adapter

### 4. DIY: ESLint + Vitest Coverage

Kein off-the-shelf CRAP-Tool nötig:

1. ESLint `complexity`-Rule mit `max: 10` → fängt CC-Verletzungen
2. Vitest Coverage → Istanbul JSON
3. Kleines Skript, das aus CC + Coverage den CRAP-Wert berechnet und bei > 10 exit(1)

**Nachteil:** CC aus ESLint ist AST-basiert, Coverage ist runtime-basiert – die Zuordnung pro Funktion erfordert Parsing beider Quellen und ist fehleranfällig. Die dedizierten Tools tun das robuster.

## Threshold 10 – Einordnung

| Quelle | Empfohlener CRAP-Threshold |
|--------|---------------------------|
| repowise.dev | 30 |
| MyVar Guide | CC < 10, CRAP < 30 |
| unclebob/crap4clj | Risk-Kategorien (low/medium/high) |
| **Unser Ziel** | **10** |

CRAP 10 ist **deutlich strenger** als der übliche Richtwert 30. Es bedeutet:
- Bei 100% Coverage: CC darf max. 10 sein (entspricht dem üblichen CC-Threshold)
- Bei 50% Coverage: CC darf max. 6–7 sein
- Bei 0% Coverage: CC darf max. 5 sein

**Praktisch:** Für ein kleines Projekt (blind-typing-multiplayer) mit guter Testabdeckung ist 10 machbar, aber es wird jeden ungetesteten Code mit CC > 5 blockieren. Das ist ein bewusster Trade-off: sehr hohe Test-Disziplin vs. Flexibilität.

## Empfohlener Ansatz

1. `@barney-media/crap-typescript-vitest` als devDependency installieren
2. Vitest-Config um `crap: { threshold: 10 }` ergänzen
3. In CI: `vitest run --coverage` → CRAP-Gate läuft automatisch mit
4. Optional: ESLint `complexity` mit `max: 10` als frühes Feedback (vor Testlauf)

## Quellen

- https://github.com/fabian-barney/crap-typescript
- https://npm.io/package/@barney-media/crap-typescript
- https://libraries.io/npm/@barney-media%2Fcrap-typescript
- https://github.com/breezy-bays-labs/crap4ts
- https://breezy-bays-labs.github.io/crap-rs/book/configuration.html
- https://lib.rs/crates/crap4ts
- https://github.com/ahilke/js-crap-score
- https://www.npmjs.com/package/crap-score
- https://repowise.dev/glossary/crap-score
- https://betterstack.com/community/guides/ai/crap-metric/
- https://gibbok.github.io/myvar/code-quality-metrics/cyclomatic-complexity-and-crap-metrics-guide/
- https://eslint.org/docs/latest/rules/complexity
