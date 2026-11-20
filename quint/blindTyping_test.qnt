// Deterministische Tests der Engine (quint test).
// Deckt die seltene/sequenzielle Logik ab, die die Zufallssimulation
// (quint run) nicht zuverlässig erreicht: Rotation, Finish-&-Warten,
// Blockier-Semantik, Host-Verhalten, Zuschauer-Beitritt.
// Hinweis: Quint 0.33.1 setzt nach `.fail()` den Zustand nicht fort
// (QNT502 "Variable state not set") -> `.fail()` steht immer am
// Kettenende; die Fortsetzung wird in einem separaten Test geprüft.
// Hinweis: Der Host (pid 1) ist nach `init` NICHT Spieler: Das Spiel
// startet im Warten OHNE Spieler; der Host durchläuft denselben
// Join-Dialog wie alle anderen -> Tests, die eine Runde starten,
// beginnen mit `join(1, …)` + `startSession(1)`.
// Hinweis: `join` fügt in ALLEN Phasen einen Zuschauer hinzu.
// `startRound` macht aus allen Zuschauern die Spieler (Roster-Assembly).
module blindTyping_test {
  // Direkter Import der Engine-Instanz (Quint-Imports sind nicht transitiv:
  // blindTyping_3 definiert keine eigenen Namen, nur die Instanzierung).
  import blindTyping(
    HOST = 1,
    PIDS = Set(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    MAX_PLAYERS = 8,
    DURATIONS = Set(30, 60, 120),
    TEXTS = Set(List("a", "b", "c"), List("d", "e", "f", "g", "h")),
    KEYS = Set("a", "b", "c", "d", "e", "f", "g", "h", "x"),
    NICKNAMES = Set("ann", "ben", "carl", "dora", "eve", "fred", "gus", "hal", "ida", "joe")
  ).* from "./blindTyping"

  // Wertung (Spec-Formel): langsam+korrekt schlägt schnell+ungenau.
  // p1: 2 korrekt, 0 Fehler -> Score 20. p2: 1 korrekt, 2 Fehler -> Score 6.
  run scoreSlowBeatsFastTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(startSession(1))
      .then(startRound(1, List("d", "e", "f", "g", "h")))
      .then(keystroke(1, "d"))
      .then(keystroke(1, "e"))
      .then(keystroke(2, "d"))
      .then(keystroke(2, "x"))
      .then(keystroke(2, "x"))
      .expect(score(state, 1) > score(state, 2))

  // Blockier-Semantik (ADR 0003): falsche Taste -> Error, Cursor rückt.
  run blockingTest =
    init
      .then(join(1, "ann"))
      .then(startSession(1))
      .then(startRound(1, List("a", "b", "c")))
      .then(keystroke(1, "x"))
      .expect(and {
        state.players.get(1).errors == 1,
        state.players.get(1).cursor == 1,
        state.players.get(1).correct == 0,
      })

  // Korrekte Taste -> Cursor rückt, Correct++.
  run correctKeystrokeTest =
    init
      .then(join(1, "ann"))
      .then(startSession(1))
      .then(startRound(1, List("a", "b", "c")))
      .then(keystroke(1, "a"))
      .expect(and {
        state.players.get(1).cursor == 1,
        state.players.get(1).correct == 1,
        state.players.get(1).errors == 0,
      })

  // Finish & Warten (Gap-Answer 2), Teil 1: nach Textende sind
  // weitere Keystrokes blockiert.
  run finishBlocksKeystrokeTest =
    init
      .then(join(1, "ann"))
      .then(startSession(1))
      .then(startRound(1, List("a", "b", "c")))
      .then(keystroke(1, "a"))
      .then(keystroke(1, "b"))
      .then(keystroke(1, "c"))
      .expect(state.players.get(1).cursor == 3)
      .then(keystroke(1, "a").fail())

  // Finish & Warten (Gap-Answer 2), Teil 2: Wertung bleibt fixiert,
  // Runde läuft normal zu Ende. (3c/0e -> 3*10 - 0*2 = 30)
  run finishScoreFixedTest =
    init
      .then(join(1, "ann"))
      .then(startSession(1))
      .then(startRound(1, List("a", "b", "c")))
      .then(keystroke(1, "a"))
      .then(keystroke(1, "b"))
      .then(keystroke(1, "c"))
      .then(60.reps(i => tick))
      .then(roundEnd)
      .expect(and {
        state.phase == Results,
        state.players.get(1).correct == 3,
        state.players.get(1).errors == 0,
        score(state, 1) == 30,
      })

  // Start-Recht rotiert nach jeder Session (Kopf -> Ende der Queue).
  // Solo-Szenario: deterministisch (einziger connected Pid = Host).
  run rotationTest =
    init
      .then(join(1, "ann"))
      .then(startSession(1))
      .then(startRound(1, List("a", "b", "c")))
      .then(60.reps(i => tick))
      .then(roundEnd)
      .then(endSession)
      .expect(and {
        state.phase == WaitingForNewSession,
        state.queueHead == 1,
        state.spectators.keys() == Set(1),
      })
      .then(startSession(1))
      .then(startRound(1, List("d", "e", "f", "g", "h")))
      .expect(and {
        state.roundNumber == 2,
        state.phase == Round,
      })

  // Solo-Zyklus: ein Spieler kann endlos Sessions drehen.
  run soloCycleTest =
    init
      .then(join(1, "ann"))
      .then(startSession(1))
      .then(startRound(1, List("a", "b", "c")))
      .then(60.reps(i => tick))
      .then(roundEnd)
      .then(endSession)
      .then(startSession(1))
      .then(startRound(1, List("d", "e", "f", "g", "h")))
      .expect(and {
        state.roundNumber == 2,
        state.phase == Round,
        state.players.keys() == Set(1),
      })

  // Host verlässt -> wird aus Spielern entfernt, Phase bleibt Round.
  // Nicht-Host-Spieler bleibt in der Liste, Runde läuft weiter.
  run hostLeaveRemovesTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(startSession(1))
      .then(startRound(1, List("a", "b", "c")))
      .then(disconnect(1))
      .expect(and {
        state.phase == Round,
        state.players.keys() == Set(2),
        state.queueHead == NO_PID,
      })

  // Nicht-Host verlässt -> aus spectators entfernt, queueHead bleibt.
  run disconnectRemovesFromQueueTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(disconnect(2))
      .expect(and {
        state.spectators.keys() == Set(1),
        state.queueHead == 1,
        state.phase == WaitingForNewSession,
      })

  // QueueHead verlässt -> queueHead wird NO_PID.
  run disconnectQueueHeadTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(disconnect(1))
      .expect(and {
        state.spectators.keys() == Set(2),
        state.queueHead == NO_PID,
        state.phase == WaitingForNewSession,
      })

  // Beitritt ist in ALLEN Phasen möglich (Zuschauer-Beitritt, jederzeit).
  // In der Runde: neuer Zuschauer, Spieler-Roster bleibt unverändert.
  run joinInRoundSucceedsTest =
    init
      .then(join(1, "ann"))
      .then(startSession(1))
      .then(startRound(1, List("a", "b", "c")))
      .then(join(2, "ben"))
      .expect(and {
        state.spectators.keys() == Set(2),
        state.players.keys() == Set(1),
        state.phase == Round,
      })

  // Beitritt in den Results: neuer Zuschauer, Results bleiben.
  run joinInResultsSucceedsTest =
    init
      .then(join(1, "ann"))
      .then(startSession(1))
      .then(startRound(1, List("a", "b", "c")))
      .then(60.reps(i => tick))
      .then(roundEnd)
      .then(join(2, "ben"))
      .expect(and {
        state.spectators.keys() == Set(2),
        state.phase == Results,
      })

  // Doppelte Teilnahme blockiert (bereits connected -> join abgelehnt).
  run noDoubleJoinTest =
    init
      .then(join(2, "ben"))
      .then(join(2, "carl").fail())

  // Dauer wählt nur der Host, Teil 1: Nicht-Host ist blockiert.
  run durationNonHostBlockedTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(startSession(1))
      .then(setDuration(2, 30).fail())

  // Dauer wählt nur der Host, Teil 2: Host setzt die Dauer.
  run durationHostSetsTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(startSession(1))
      .then(setDuration(1, 30))
      .expect(state.roundDuration == 30)

  // Host trägt eigenen Namen ein (gleicher Dialog wie alle anderen);
  // erscheint als Zuschauer mit dem gewählten Nickname.
  run hostSetsOwnNameTest =
    init
      .then(join(1, "carl"))
      .expect(and {
        state.spectators.get(1) == "carl",
        isHost(state, 1),
      })
}
