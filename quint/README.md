# Quint-Modell: Blind-Typing-Engine

Modelliert `docs/spec.md` (LAN-Multiplayer-Blind-Typing-Rennen) als reine,
deterministische Event-Engine — die einzige Testnaht der Spec
(„pure deterministic event-driven engine"). WS-Layer und SPA sind dünne
Adapter und bewusst **nicht** modelliert.

## Dateien

| Datei | Zweck |
|---|---|
| `blindTyping.qnt` | Engine: Typen, Invarianten, Witnesses, 9 guarded Actions, `step`. Nimmt Konstanten als Modul-Parameter. |
| `blindTyping_3.qnt` | Instanz (4 Spieler, 2 kurze Texte, 6 Tasten) für `quint run` — klein genug für schnelle, breite Erkundung. |
| `blindTyping_test.qnt` | 15 deterministische Tests (`quint test`) für seltene/sequenzielle Pfade. |

## Ausführen

```bash
# typecheck: quint akzeptiert nur EINE Datei pro Aufruf
quint typecheck quint/blindTyping.qnt
quint typecheck quint/blindTyping_3.qnt
quint typecheck quint/blindTyping_test.qnt

# Simulation (1000 Traces, 400 Schritte, alle Invarianten + Witnesses)
quint run quint/blindTyping_3.qnt --main blindTyping_3 \
  --max-samples 1000 --max-steps 400 \
  --invariants cursorEqualsCorrect cursorBounded nonNegative queueMatchesPlayers startHolderValid timeBounded resultsTimeZero \
  --witnesses reachedWaiting reachedRound reachedResults someError someFinished secondRound soloRound rotation emptyRound emptyResults

# Tests — ACHTUNG: --match '.*Test$' ist Pflicht, sonst führt quint test
# auch alle importierten Defs als Tests aus (QNT516/QNT502-Noise).
quint test quint/blindTyping_test.qnt --main blindTyping_test --match '.*Test$'
```

Quint 0.33.1 (brew) hat kein `basicSpells` — nur die Built-ins.

## Modell-Entscheidungen (Annahmen)

- **Einer Actor, ein State-Record** (`phase`, `players`, `joinQueue`,
  `roundDuration`, `timeRemaining`, `roundText`, `roundNumber`,
  `roundStarters`). Kein Choreo: die Spec definiert selbst eine einzige
  Testnaht.
- **Text als `List[str]`** (Quint hat keine String-Operationen); ein
  Element pro Zeichen.
- **Keystroke nur bei `timeRemaining > 0`**: Tasten geschehen zwischen
  Ticks; in der letzten Sekunde ist der Cursor „zu" (Modellierungswahl,
  Spec still).
- **Host = erster Spieler** (Spec-Regel): `init` ist leer (kein Auto-Join);
  der erste `join` wird Host. Quint kann Strings nicht konkatenieren, daher
  gibt es kein `displayName` — stattdessen `pure def isHost(pid): bool`,
  und das „(Host)"-Suffix ist eine UI-Ableitung (Nickname + Flag).
  Modell-Limitation: `HOST` ist eine Modul-Konstante — disconnectet der
  Host, kann niemand mehr `startSession` (kein Deadlock: `join`/
  `disconnect` bleiben aktiv). Die App weicht ab: sie promoted den nächsten
  Spieler zum Host (docs/spec.md).
- **Session-Zyklus:** `WaitingForNewSession → Lobby → Round → Results →
  WaitingForNewSession → …`. `startSession(HOST)` (nur aus Waiting, nur
  Host; Spieler + Queue bleiben erhalten) und `endSession` (nur aus Results;
  rotiert das Start-Recht) ersetzen das alte `backToLobby`. Leere
  Runde/Results beenden das Spiel **nicht** mehr — der Zyklus geht weiter.
- **Wertung = Spec-Formel** `score = Genauigkeit² × Zeichen/s × 100`
  (int-Arithmetik; 10c/0e, 60 s → 16 schlägt 12c/6e → 8).
- **Finger-Hinweis/Leaderboard/WPM/Genauigkeit** sind reine Ableitungen
  (`accuracy`, `wpm` als pure defs), nicht gespeichert, nicht gewertet
  (ADR 0003).

## Abdeckung: Spec-Story → Modell

| Spec (docs/spec.md) | Modell |
|---|---|
| Host = erster Spieler, kein Auto-Join, eigener Name | `init` (leer) + `isHost` + Test `hostSetsOwnNameTest` |
| Session-Zyklus Waiting→Lobby→Round→Results→Waiting | `startSession`/`endSession` + Witnesses `reachedWaiting`, `secondRound`, `rotation`, `soloRound` |
| Join nur ohne laufendes Spiel (Waiting/Lobby), 2–8 Spieler, Nickname | `join` + `canJoin` + Tests `joinBlockedInRoundTest`, `joinBlockedInResultsTest` |
| Start-Recht rotiert, frühester Joiner zuerst, 1+ Spieler | `startRound` + `startHolder` (Queue-Kopf) + Rotation in `endSession` |
| Feste Dauer 30/60/120 s, Host wählt, 60 Default | `setDuration` (nur Host) + `DEFAULT_DURATION` |
| Gleicher zufälliger Text für alle | `startRound(pid, text)` setzt `roundText` global |
| Blockierende falsche Taste (ADR 0003) | `keystroke` + Invarianten `cursorEqualsCorrect`, `cursorBounded` |
| Runde endet nach fester Dauer | `tick`/`roundEnd` + `timeBounded`, `resultsTimeZero` |
| Wertung Tempo+Genauigkeit | `score(p, durationSec)` + Test `scoreSlowBeatsFastTest` |
| Live-Leaderboard, eigene WPM/Genauigkeit | `accuracy`, `wpm` (pure, abgeleitet) |
| Disconnect entfernt Spieler | `disconnect` + Tests `hostLeaveRemovesTest`, `disconnectRemovesFromQueueTest` |
| Dauer wählt nur Host (Kaller-Check) | `setDuration(pid, d)` |
| Holder verlässt Lobby → nächster | `startHolder` (Queue-Kopf) + Invariante `startHolderValid` |
| Text fertig → warten, Wertung fixiert (Gap-Answer 2) | `finished` in `canKeystroke` + Tests `finishBlocksKeystrokeTest`, `finishScoreFixedTest` |
| Leere Runde/Results → Session-Zyklus weiter (kein GameOver) | `roundEnd`/`endSession` + Witnesses `emptyRound`, `emptyResults` |
| Keine Persistenz/Accounts/Sound/QR | nicht modelliert (keine State-Felder dafür) |

**Tests (15, alle grün):** scoreSlowBeatsFast, blocking, correctKeystroke,
finishBlocksKeystroke, finishScoreFixed, rotation, soloCycle, hostLeaveRemoves,
disconnectRemovesFromQueue, joinBlockedInRound, joinBlockedInResults,
noDoubleJoin, durationNonHostBlocked, durationHostSets, hostSetsOwnName.

**Simulation (1000 Traces, 400 Schritte):** alle 7 Invarianten halten,
kein Deadlock. Erreichbarkeit: Waiting 100 %, Round 100 %, Results 100 %,
zweite Runde 100 %, Solo-Runde 100 %, Rotation 72,1 %, Error 99,4 %,
Finished 0,6 %, leere Runde 100 %, leere Results 100 % (der Session-Zyklus
macht leere Zustände regulär erreichbar — sie beenden das Spiel nicht mehr).

## ⚠️ Gefundene Lücken/Fehler in der Spec

1. ~~**Deadlock: letzter Nicht-Host-Spieler verlässt mitten in der Runde.**~~
   **Gelöst (2026-11-18, überarbeitet 2026-11-19):** Ursprünglich: leere
   Results → GameOver. Mit dem Session-Zyklus
   (`Results → endSession → WaitingForNewSession`) gibt es keinen
   Terminal-Zustand mehr: leere Runde/Results beenden das Spiel nicht,
   eine neue Session kann immer gestartet werden.
2. ~~**Host-Teilnahme ist nicht erzwungen.**~~
   **Gelöst (2026-11-18, überarbeitet 2026-11-19):** Design-Entscheidung:
   Host = erster Spieler, der über den normalen Join-Dialog eintritt
   (kein Auto-Join, eigener Name, „(Host)"-Suffix in der UI).
3. ~~**Start-Recht-Holder verlässt die Lobby** → nächster übernimmt.~~
   **Gelöst (2026-11-18):** Spec-Satz ergänzt: „If the holder leaves the
   lobby, the next player in the queue holds it." (Modell macht das bereits
   via Queue; Invariante `startHolderValid`.)
4. ~~**Text-Kalibrierung nur für 60 s spezifiziert.**~~
   **Gelöst (2026-11-18):** Lineare Skalierung (~1–1,3 Zeichen/s):
   30 s → 30–40 Zeichen, 60 s → 60–80 Zeichen, 120 s → 120–160 Zeichen.
   (Content-Problem, nicht Engine-Logik.)
5. ~~**Wertungs-Formel offen.**~~
   **Gelöst (2026-11-18):** `score = Genauigkeit² × (korrekte Zeichen / Dauer) × 100`
   (int-Arithmetik; 0 bei keiner Eingabe). Belohnt Technik: langsam+korrekt
   schlägt schnell+ungenau (Beispiel 60 s: 10c/0e → 16 > 12c/6e → 8).
6. *(Nicht-Problem)* Finger-Hinweis und Leaderboard sind reine Ableitungen —
   im Modell als pure defs, bewusst nicht im State.

## Quint-0.33.1-Fallstricke (für Wartung)

- `quint test` ohne schmales `--match` führt importierte Defs als Tests aus.
- `.fail()` am Kettenende ist ok; **`.fail()` gefolgt von `.then(...)` bricht**
  (QNT502 „Variable state not set") — deshalb sind Finish-/Dauer-Tests gesplittet.
- `.*`-Imports sind nicht transitiv; Tests importieren `blindTyping` direkt.
- Aktionen mit Parametern brauchen `: bool`; `not` braucht Klammern.
