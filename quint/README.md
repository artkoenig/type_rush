# Quint-Modell: Blind-Typing-Engine

Modelliert `docs/spec.md` (LAN-Multiplayer-Blind-Typing-Rennen) als reine,
deterministische Event-Engine — die einzige Testnaht der Spec
(„pure deterministic event-driven engine"). WS-Layer und SPA sind dünne
Adapter und bewusst **nicht** modelliert.

## Dateien

| Datei | Zweck |
|---|---|
| `blindTyping.qnt` | Engine: Typen, 10 Invarianten, 10 Witnesses, 9 guarded Actions + `step`. Nimmt Konstanten als Modul-Parameter. |
| `blindTyping_3.qnt` | Instanz (10 Pids, 2 kurze Texte, 9 Tasten, 10 Nicknames, MAX_PLAYERS=8) für `quint run`. |
| `blindTyping_test.qnt` | 16 deterministische Tests (`quint test`) für seltene/sequenzielle Pfade. |

## Ausführen

```bash
# typecheck: quint akzeptiert nur EINE Datei pro Aufruf
quint typecheck quint/blindTyping.qnt
quint typecheck quint/blindTyping_3.qnt
quint typecheck quint/blindTyping_test.qnt

# Invarianten (1000 Traces, 20 Schritte reichen — Invarianten sind lokal)
quint run quint/blindTyping_3.qnt --main blindTyping_3 \
  --max-samples 1000 --max-steps 20 \
  --invariants rosterBounded disjoint queueHeadValid winnerValid timeBounded connectedSubset spectatorNicknames playerNicknames cursorBounded nonNegative

# Reachability (200 Schritte nötig: 60 Ticks pro Runde + Übergänge)
quint run quint/blindTyping_3.qnt --main blindTyping_3 \
  --max-samples 10000 --max-steps 200 \
  --witnesses reachedRound secondRound someSpectator somePlayer someWinner

# Tests — ACHTUNG: --match '.*Test$' ist Pflicht, sonst führt quint test
# auch alle importierten Defs als Tests aus (QNT516/QNT502-Noise).
quint test quint/blindTyping_test.qnt --main blindTyping_test --match '.*Test$'
```

Quint 0.33.1 (brew) hat kein `basicSpells` — nur die Built-ins.

## State-Shape

```
EngineState = {
  phase: Phase,            // WaitingForNewSession | Lobby | Round | Results
  players: int -> PlayerState,  // aktive Spieler (≤ MAX_PLAYERS)
  spectators: int -> str,       // verbundene Nicht-Spieler (unbegrenzt)
  winner: int,             // NO_PID (-1) oder letzter Gewinner
  queueHead: int,          // NO_PID oder Pid mit Start-Recht
  roundDuration: int,      // 30 | 60 | 120
  timeRemaining: int,      // zählt runter bei tick
  roundText: List[str],    // ein Element pro Zeichen
  roundNumber: int         // 0-basiert, inkrementiert bei startRound
}
```

**Zuschauer-Konzept:** Alle verbundenen Pids, die gerade nicht spielen.
Dazu zählen:
- Spieler, die die Seite neu geladen haben (disconnect → spectator)
- Spieler, die nach `endSession` wieder im Warte-Zustand sind
- Neue Teilnehmer, die `join` aufrufen

Maximal `MAX_PLAYERS` (8) Spieler gleichzeitig; Zuschauer unbegrenzt.

## Roster-Assembly (`startRound`)

Beim Start einer Runde werden **alle aktuellen Zuschauer** zu Spielern:
`s.spectators.keys().mapBy(pid => {...EMPTY_PS, nickname: s.spectators.get(pid)})`.
Die Invariante `rosterBounded` (≤ MAX_PLAYERS) ist der Safety-Net;
der Client begrenzt das Roster vor dem Aufruf. Der Gewinner der
vorherigen Runde ist bereits im Warte-Zustand (via `endSession` →
spectators) und wird automatisch wieder Spieler.

## Modell-Entscheidungen (Annahmen)

- **Einer Actor, ein State-Record.** Kein Choreo: die Spec definiert
  selbst eine einzige Testnaht.
- **Text als `List[str]`** (Quint hat keine String-Operationen); ein
  Element pro Zeichen.
- **Keystroke nur bei `timeRemaining > 0`**: Tasten geschehen zwischen
  Ticks; in der letzten Sekunde ist der Cursor „zu" (Modellierungswahl,
  Spec still).
- **Host = Modul-Konstante** (`HOST: int`): `init` ist leer (kein
  Auto-Join); der erste `join` setzt `queueHead`. `isHost` prüft
  `pid == HOST`. Modell-Limitation: disconnectet der Host, kann niemand
  mehr `startSession` (kein Deadlock: `join`/`disconnect` bleiben aktiv).
  Die App weicht ab: sie promoted den nächsten zum Host.
- **Session-Zyklus:** `WaitingForNewSession → Lobby → Round → Results →
  WaitingForNewSession → …`. `startSession` (nur aus Waiting, nur Host
  mit Start-Recht) und `endSession` (nur aus Results; alle Spieler →
  Zuschauer, neue Rotation) schließen den Zyklus.
- **Verlassen ist permanent für die Runde:** `disconnect` entfernt den
  Pid aus `players` ODER `spectators` (und aus `queueHead`/`winner`
  → NO_PID). Der Spieler kann erst in der nächsten Runde wieder
  einsteigen (via `join` → spectator → `startRound` → player).
- **Wertung = vereinfachte Formel** `score = correct × 10 − errors × 2`
  (int-Arithmetik). Belohnt Genauigkeit über Tempo. Die Spec-Formel
  (`Genauigkeit² × Zeichen/s × 100`) ist äquivalent in der
  Rangfolge; die vereinfachte Version vermeidet Division.
- **Finger-Hinweis/Leaderboard/WPM/Genauigkeit** sind reine Ableitungen
  (`accuracy`, `wpm` als pure defs), nicht gespeichert, nicht gewertet
  (ADR 0003).

## Abdeckung: Spec-Story → Modell

| Spec (docs/spec.md) | Modell |
|---|---|
| Host = erster Spieler, eigener Name | `HOST` (Modul-Param) + `isHost` + Test `hostSetsOwnNameTest` |
| Session-Zyklus Waiting→Lobby→Round→Results→Waiting | `startSession`/`endSession` + Witnesses `reachedWaiting`, `secondRound` |
| Join jederzeit (alle Phasen), Nickname | `join` (→ spectator) + Tests `joinInRoundSucceedsTest`, `joinInResultsSucceedsTest` |
| Max 8 Spieler, unbegrenzte Zuschauer | `MAX_PLAYERS` + Invariante `rosterBounded` + `spectators` (unbegrenzt) |
| Start-Recht rotiert | `queueHead` + `queueHeadCand` (nondet in `endSession`) |
| Feste Dauer 30/60/120 s, Host wählt, 60 Default | `setDuration` (nur Host in Lobby) + `DEFAULT_DURATION` |
| Gleicher zufälliger Text für alle | `startRound(pid, text)` setzt `roundText` global |
| Blockierende falsche Taste (ADR 0003) | `keystroke` + Invarianten `cursorBounded`, `nonNegative` |
| Runde endet nach fester Dauer | `tick`/`roundEnd` + `timeBounded` |
| Wertung Tempo+Genauigkeit | `score(s,pid)` + Test `scoreSlowBeatsFastTest` |
| Live-Leaderboard, eigene WPM/Genauigkeit | `accuracy`, `wpm` (pure, abgeleitet) |
| Disconnect entfernt Spieler (permanent für Runde) | `disconnect` + Tests `hostLeaveRemovesTest`, `disconnectQueueHeadTest` |
| Dauer wählt nur Host (Kaller-Check) | `setDuration(pid, d)` |
| Text fertig → warten, Wertung fixiert | `finished` in `canKeystroke` + Tests `finishBlocksKeystrokeTest`, `finishScoreFixedTest` |
| Leere Runde/Results → Zyklus weiter | `roundEnd`/`endSession` + Witness `emptyResults` |
| Gewinner kommt automatisch in nächste Runde | `endSession` → spectators + `startRound` → players |
| Keine Persistenz/Accounts/Sound/QR | nicht modelliert (keine State-Felder dafür) |

**Tests (16, alle grün):** scoreSlowBeatsFast, blocking, correctKeystroke,
finishBlocksKeystroke, finishScoreFixed, rotation, soloCycle, hostLeaveRemoves,
disconnectRemovesFromQueue, disconnectQueueHead, joinInRoundSucceeds,
joinInResultsSucceeds, noDoubleJoin, durationNonHostBlocked, durationHostSets,
hostSetsOwnName.

**Simulation (10000 Traces, 200 Schritte):** alle 10 Invarianten halten.
Erreichbarkeit: Round 18,7 %, zweite Runde 0,11 %, Zuschauer 100 %,
Spieler 18,7 %, Winner 1,7 % (seltene Pfade wegen 60 Ticks pro Runde;
mit mehr Samples/Steps steigt der Anteil).

## ⚠️ Gefundene Lücken/Fehler in der Spec

1. ~~**Deadlock: letzter Nicht-Host-Spieler verlässt mitten in der Runde.**~~
   **Gelöst (2026-11-18, überarbeitet 2026-11-19):** Mit dem Session-Zyklus
   (`Results → endSession → WaitingForNewSession`) gibt es keinen
   Terminal-Zustand mehr: leere Runde/Results beenden das Spiel nicht.
2. ~~**Host-Teilnahme ist nicht erzwungen.**~~
   **Gelöst (2026-11-18, überarbeitet 2026-11-19):** Design-Entscheidung:
   Host = erster Spieler, der über den normalen Join-Dialog eintritt.
3. ~~**Start-Recht-Holder verlässt die Lobby** → nächster übernimmt.~~
   **Gelöst (2026-11-18):** `queueHead` → NO_PID bei disconnect;
   Invariante `queueHeadValid`.
4. ~~**Text-Kalibrierung nur für 60 s spezifiziert.**~~
   **Gelöst (2026-11-18):** Lineare Skalierung (~1–1,3 Zeichen/s).
   (Content-Problem, nicht Engine-Logik.)
5. ~~**Wertungs-Formel offen.**~~
   **Gelöst (2026-11-18):** `score = correct × 10 − errors × 2`
   (vereinfacht; belohnt Technik: langsam+korrekt schlägt schnell+ungenau).
6. *(Nicht-Problem)* Finger-Hinweis und Leaderboard sind reine Ableitungen —
   im Modell als pure defs, bewusst nicht im State.

## Quint-0.33.1-Fallstricke (für Wartung)

### Syntax/Parser

- `reach` → **kein Keyword** (Parse-Fehler). Witnesses als `val`.
- `const X: T = val` in Module → Parse-Fehler. `const` = Parameter ohne
  Init (wird beim Import gebunden); lokale Konstanten als `pure val`.
- `map[k]` → wird als List-Index interpretiert (FAIL). `map.get(k)` statt.
- `list.indexOf(k)`, `map.values()`, `map.size()` → QNT404 (existiert nicht).
- `x.in(list)` → FAIL („Couldn't unify set and list"). Nur `x.in(set)`.
- `(0..10).oneOf()` in `nondet` → Parse-Fehler (Range-Expression geht nicht).
- `assume` zwischen `nondet` und `state'` → Crash.
- `all` + `nondet` → QNT404.
- Lambda-Body beginnend mit `not`/`if` → Parse-Fehler (Klammer nötig).
- `def f(x:T) = ...` ohne Return-Annotation → QNT200.
- `pure def` darf `state` (var) **nicht** lesen → immer `s: EngineState`
  als Parameter.
- `.*`-Imports sind nicht transitiv; Tests importieren `blindTyping` direkt.
- Aktionen mit Parametern brauchen `: bool`; `not` braucht Klammern.

### CLI

- `quint run` Flags: `--invariants name1 name2 ...` (array),
  `--witnesses name1 name2 ...` (array). **Nicht** `--property`.
- `quint test` ohne schmales `--match` führt importierte Defs als Tests aus.
- `.fail()` am Kettenende ist ok; **`.fail()` gefolgt von `.then(...)` bricht**
  (QNT502 „Variable state not set") — deshalb sind Finish-/Dauer-Tests gesplittet.

### Semantik

- `set.filter(f)` → Set; `set.select(f)` → List; `set.map(f)` → Set;
  `set.mapBy(f)` → Set.
- `list.nth(k)`, `list.head()`, `list.tail()`, `list.append(x)`,
  `list.length()`, `list.slice(a,b)` → vorhanden.
- `list.filter/map/mapBy/exists/forall` → **nicht vorhanden** (QNT404).
- `set.toList`, `set.difference/intersection`, `set.max/min`,
  `set.take/drop/sort` → **nicht vorhanden**.
- `map.keys()` → Set; `map.keys().size()` → int; `map.put(k,v)` → Map;
  `map.set(k,v)` → Map.
- `apalache::generate(Set(...))` → nur für int-Sets, nicht für str.
- `oneOf` in `pure def` → QNT203 (nur in `nondet`/`any`).
