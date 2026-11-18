// Deterministische Tests der Engine (quint test).
// Deckt die seltene/sequenzielle Logik ab, die die Zufallssimulation
// (quint run) nicht zuverlässig erreicht: Rotation, Finish-&-Warten,
// Blockier-Semantik, Host-Verhalten.
// Hinweis: Quint 0.33.1 setzt nach `.fail()` den Zustand nicht fort
// (QNT502 "Variable state not set") -> `.fail()` steht immer am
// Kettenende; die Fortsetzung wird in einem separaten Test geprüft.
// Hinweis: Der Host (pid 1) ist nach `init` bereits Spieler (auto-Join,
// Spec-Regel „Host spielt immer") -> kein `join(1, …)` in den Tests.
module blindTyping_test {
  // Direkter Import der Engine-Instanz (Quint-Imports sind nicht transitiv:
  // blindTyping_3 definiert keine eigenen Namen, nur die Instanzierung).
  import blindTyping(
    HOST = 1,
    PLAYERS = Set(1, 2, 3, 4),
    MAX_PLAYERS = 8,
    DURATIONS = Set(30, 60, 120),
    TEXTS = Set(List("a", "b", "c"), List("d", "e", "f", "g", "h")),
    KEYS = Set("a", "b", "c", "d", "e", "f", "g", "h", "x"),
    NICKNAMES = Set("ann", "ben", "carl", "dora"),
    HOST_NICK = "host"
  ).* from "./blindTyping"

  // Wertung (Spec-Formel): langsam+korrekt schlägt schnell+ungenau.
  run scoreSlowBeatsFastTest =
    init.expect(
      score({ nickname: "s", cursor: 10, correct: 10, errors: 0 }, 60) >
      score({ nickname: "f", cursor: 12, correct: 12, errors: 6 }, 60))

  // Blockier-Semantik (ADR 0003): falsche Taste -> Error, Cursor bleibt.
  run blockingTest =
    init
      .then(startRound(1, List("a", "b", "c")))
      .then(keystroke(1, "x"))
      .expect(and {
        state.players.get(1).errors == 1,
        state.players.get(1).cursor == 0,
        state.players.get(1).correct == 0,
      })

  // Korrekte Taste -> Cursor rückt, Correct++.
  run correctKeystrokeTest =
    init
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
      .then(startRound(1, List("a", "b", "c")))
      .then(keystroke(1, "a"))
      .then(keystroke(1, "b"))
      .then(keystroke(1, "c"))
      .expect(state.players.get(1).cursor == 3)
      .then(keystroke(1, "a").fail())

  // Finish & Warten (Gap-Answer 2), Teil 2: Wertung bleibt fixiert,
  // Runde läuft normal zu Ende. (3c/0e, 60s -> 100*27/(9*60) = 5)
  run finishScoreFixedTest =
    init
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
        score(state.players.get(1), 60) == 5,
      })

  // Start-Recht rotiert nach jeder Runde (Kopf -> Ende der Queue).
  run rotationTest =
    init
      .then(join(2, "ben"))
      .then(startRound(1, List("a", "b", "c")))
      .then(60.reps(i => tick))
      .then(roundEnd)
      .then(backToLobby)
      .then(startRound(2, List("d", "e", "f", "g", "h")))
      .expect(and {
        state.roundNumber == 2,
        state.roundStarters == List(1, 2),
      })

  // Solo-Zyklus: ein Spieler kann endlos Runden drehen.
  run soloCycleTest =
    init
      .then(startRound(1, List("a", "b", "c")))
      .then(60.reps(i => tick))
      .then(roundEnd)
      .then(backToLobby)
      .then(startRound(1, List("d", "e", "f", "g", "h")))
      .expect(and {
        state.roundNumber == 2,
        state.roundStarters == List(1, 1),
      })

  // Host verlässt -> GameOver für alle (auch mitten in der Runde);
  // der Host wird entfernt, Nicht-Host-Spieler bleibt in der Liste.
  run hostLeaveEndsGameTest =
    init
      .then(join(2, "ben"))
      .then(startRound(1, List("a", "b", "c")))
      .then(disconnect(1))
      .expect(and {
        state.phase == GameOver,
        state.players.keys() == Set(2),
      })

  // Nicht-Host verlässt -> aus Spielern + Queue entfernt, Phase bleibt.
  run disconnectRemovesFromQueueTest =
    init
      .then(join(2, "ben"))
      .then(disconnect(2))
      .expect(and {
        state.joinQueue == List(1),
        state.players.keys() == Set(1),
        state.phase == Lobby,
      })

  // Join nur in der Lobby (Gap-Answer 1): in der Runde blockiert.
  run joinOnlyInLobbyTest =
    init
      .then(startRound(1, List("a", "b", "c")))
      .then(join(2, "ben").fail())

  // Doppelte Teilnahme blockiert (hier: Nicht-Host; der Host ist nach
  // init bereits Spieler, sein zweiter Join wäre derselbe Fall).
  run noDoubleJoinTest =
    init
      .then(join(2, "ben"))
      .then(join(2, "carl").fail())

  // Dauer wählt nur der Host, Teil 1: Nicht-Host ist blockiert.
  run durationNonHostBlockedTest =
    init
      .then(join(2, "ben"))
      .then(setDuration(2, 30).fail())

  // Dauer wählt nur der Host, Teil 2: Host setzt die Dauer.
  run durationHostSetsTest =
    init
      .then(join(2, "ben"))
      .then(setDuration(1, 30))
      .expect(state.roundDuration == 30)

  // `emptyGameOver` (leere Results -> GameOver) ist mit „Host spielt immer"
  // unerreichbar: Der Host verbleibt immer in players (sein Disconnect
  // beendet das Spiel sofort), also kann die Queue nie leer werden.
  // Die defensive Regel bleibt im Modell und wird über den Witness
  // `emptyResults` (0% in der Simulation) abgedeckt.
}
