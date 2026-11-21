// Deterministische Tests der Engine (quint test).
// Deckt die seltene/sequenzielle Logik ab, die die Zufallssimulation
// (quint run) nicht zuverlässig erreicht: signUp, Timer, Countdown,
// Auto-Start, Re-Anmeldung nach Results, Disconnect, Blockier-Semantik.
//
// Kurze Dauer-Konstanten (3/2/5) halten die Tests schnell. Standard-Preamble
// (2 Spieler) bringt die Engine deterministisch in eine Runde:
//   join x2 -> signUp x2 -> 3x tick (Lobby 3->0) -> startCountdown
//   -> 2x tick (Countdown 2->0) -> startRound(text).
//
// Hinweis: Quint 0.33.1 setzt nach `.fail()` den Zustand nicht fort
// (QNT502) -> `.fail()` steht immer am Kettenende.
// Hinweis: `startRound(text)` und `roundEnd(w)` nehmen ihren Parameter aus
// der Engine (step: nondet); Tests übergeben ihn explizit -> deterministisch.
module blindTyping_test {
  import blindTyping(
    PIDS = Set(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    MAX_PLAYERS = 8,
    LOBBY_DURATION = 3,
    COUNTDOWN_DURATION = 2,
    ROUND_DURATION = 5,
    TEXTS = Set(List("a", "b", "c"), List("d", "e", "f", "g", "h")),
    KEYS = Set("a", "b", "c", "d", "e", "f", "g", "h", "x"),
    NICKNAMES = Set("ann", "ben", "carl", "dora", "eve", "fred", "gus", "hal", "ida", "joe")
  ).* from "./blindTyping"

  // ---- Scoring / Blockier-Semantik ----

  // Wertung (Spec-Formel): langsam+korrekt schlägt schnell+ungenau.
  // p1: 2 korrekt, 0 Fehler -> Score 20. p2: 1 korrekt, 2 Fehler -> Score 6.
  run scoreSlowBeatsFastTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("d", "e", "f", "g", "h")))
      .then(keystroke(1, "d"))
      .then(keystroke(1, "e"))
      .then(keystroke(2, "d"))
      .then(keystroke(2, "x"))
      .then(keystroke(2, "x"))
      .expect(score(state, 1) > score(state, 2))

  // Falsche Taste -> Error, Cursor rückt, Correct bleibt.
  run blockingTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
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
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .then(keystroke(1, "a"))
      .expect(and {
        state.players.get(1).cursor == 1,
        state.players.get(1).correct == 1,
        state.players.get(1).errors == 0,
      })

  // Nach Textende sind weitere Keystrokes blockiert (finished).
  run finishBlocksKeystrokeTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .then(keystroke(1, "a"))
      .then(keystroke(1, "b"))
      .then(keystroke(1, "c"))
      .expect(state.players.get(1).cursor == 3)
      .then(keystroke(1, "a").fail())

  // Wertung bleibt nach Finish fixiert; Runde endet per Zeit. (3c/0e -> 30)
  run finishScoreFixedTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .then(keystroke(1, "a"))
      .then(keystroke(1, "b"))
      .then(keystroke(1, "c"))
      .then(5.reps(i => tick))
      .then(roundEnd(1))
      .expect(and {
        state.phase == Results,
        state.players.get(1).correct == 3,
        state.players.get(1).errors == 0,
        score(state, 1) == 30,
      })

  // ---- signUp ----

  // Zuschauer -> Spieler; Nickname wird übernommen.
  run signUpMovesSpectatorToPlayerTest =
    init
      .then(join(1, "ann"))
      .then(signUp(1))
      .expect(and {
        state.players.keys() == Set(1),
        state.players.get(1).nickname == "ann",
        state.spectators.keys() == Set(),
      })

  // Volles Roster (8) -> 9. signUp blockiert.
  run signUpBlockedWhenFullTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(join(3, "carl"))
      .then(join(4, "dora"))
      .then(join(5, "eve"))
      .then(join(6, "fred"))
      .then(join(7, "gus"))
      .then(join(8, "hal"))
      .then(signUp(1))
      .then(signUp(2))
      .then(signUp(3))
      .then(signUp(4))
      .then(signUp(5))
      .then(signUp(6))
      .then(signUp(7))
      .then(signUp(8))
      .then(join(9, "ida"))
      .then(signUp(9).fail())

  // signUp nur in der Lobby (hier: in der Runde blockiert).
  run signUpBlockedOutOfLobbyTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .then(join(3, "carl"))
      .then(signUp(3).fail())

  // ---- Timer ----

  // Erster Spieler startet den Timer: ein Tick zahlt ihn herunter.
  run timerStartsOnFirstPlayerTest =
    init
      .then(join(1, "ann"))
      .then(signUp(1))
      .then(tick)
      .expect(state.timeRemaining == LOBBY_DURATION - 1)

  // Ohne Spieler tickt der Lobby-Timer nicht.
  run timerIdleWithNoPlayersTest =
    init
      .then(tick.fail())

  // Timer abgelaufen mit 1 Spieler -> zurücksetzen, Lobby wartet weiter.
  run timerResetOnExpire1PlayerTest =
    init
      .then(join(1, "ann"))
      .then(signUp(1))
      .then(3.reps(i => tick))
      .then(resetLobbyTimer)
      .expect(and {
        state.phase == Lobby,
        state.timeRemaining == LOBBY_DURATION,
      })

  // ---- Countdown ----

  // Volles Roster -> Countdown (unabhängig vom Timer).
  run countdownOnFullRosterTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(join(3, "carl"))
      .then(join(4, "dora"))
      .then(join(5, "eve"))
      .then(join(6, "fred"))
      .then(join(7, "gus"))
      .then(join(8, "hal"))
      .then(signUp(1))
      .then(signUp(2))
      .then(signUp(3))
      .then(signUp(4))
      .then(signUp(5))
      .then(signUp(6))
      .then(signUp(7))
      .then(signUp(8))
      .then(startCountdown)
      .expect(and {
        state.phase == Countdown,
        state.timeRemaining == COUNTDOWN_DURATION,
      })

  // Timer abgelaufen mit >=2 Spielern -> Countdown.
  run countdownOnTimerExpire2PlusTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .expect(and {
        state.phase == Countdown,
        state.timeRemaining == COUNTDOWN_DURATION,
      })

  // ---- Auto-Start ----

  // Nach Countdown-Ende startet die Runde automatisch.
  run autoStartRoundAfterCountdownTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .expect(and {
        state.phase == Round,
        state.timeRemaining == ROUND_DURATION,
        state.roundNumber == 1,
      })

  // ---- Results -> Lobby (Re-Anmeldung) ----

  // Nach den Results werden Spieler wieder Zuschauer (müssen neu signUp).
  run backToLobbyMakesSpectatorsTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .then(keystroke(1, "a"))
      .then(5.reps(i => tick))
      .then(roundEnd(1))
      .then(backToLobby)
      .expect(and {
        state.phase == Lobby,
        state.players.keys() == Set(),
        state.spectators.keys() == Set(1, 2),
        state.winner == NO_PID,
        state.timeRemaining == LOBBY_DURATION,
      })

  // Vollzyklus + Re-Anmeldung: nach Results kann neu signUp werden.
  run reSignupAfterResultsTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .then(keystroke(1, "a"))
      .then(5.reps(i => tick))
      .then(roundEnd(1))
      .then(backToLobby)
      .expect(state.spectators.keys() == Set(1, 2))
      .then(signUp(1))
      .expect(state.players.keys() == Set(1))

  // ---- Disconnect ----

  // Spieler verlässt in der Runde -> Roster schrumpft, Phase bleibt Round.
  run disconnectInRoundTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .then(disconnect(1))
      .expect(and {
        state.phase == Round,
        state.players.keys() == Set(2),
      })

  // Letzter Spieler verlässt in der Lobby -> Roster leer, Timer neu laden.
  run disconnectInLobbyTest =
    init
      .then(join(1, "ann"))
      .then(signUp(1))
      .then(disconnect(1))
      .expect(and {
        state.phase == Lobby,
        state.players.keys() == Set(),
        state.timeRemaining == LOBBY_DURATION,
      })

  // Zuschauer bleiben erhalten, wenn Spieler die Lobby verlassen.
  run disconnectKeepsSpectatorsTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(join(3, "carl"))
      .then(signUp(1))
      .then(signUp(2))
      .then(disconnect(1))
      .then(disconnect(2))
      .expect(and {
        state.phase == Lobby,
        state.players.keys() == Set(),
        state.spectators.get(3) == "carl",
      })

  // Winner verlässt in den Results -> winner wird NO_PID.
  run disconnectInResultsTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .then(keystroke(1, "a"))
      .then(5.reps(i => tick))
      .then(roundEnd(1))
      .then(disconnect(1))
      .expect(and {
        state.phase == Results,
        state.players.keys() == Set(2),
        state.winner == NO_PID,
      })

  // ---- join ----

  // Beitritt ist in ALLEN Phasen möglich (Zuschauer, jederzeit).
  run joinInRoundSucceedsTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .then(join(3, "carl"))
      .expect(and {
        state.spectators.keys() == Set(3),
        state.players.keys() == Set(1, 2),
        state.phase == Round,
      })

  // Beitritt in den Results: neuer Zuschauer, Results bleiben.
  run joinInResultsSucceedsTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("a", "b", "c")))
      .then(5.reps(i => tick))
      .then(roundEnd(1))
      .then(join(3, "carl"))
      .expect(and {
        state.spectators.keys() == Set(3),
        state.phase == Results,
      })

  // Doppelte Teilnahme blockiert (bereits connected -> join abgelehnt).
  run noDoubleJoinTest =
    init
      .then(join(2, "ben"))
      .then(join(2, "carl").fail())

  // Eigener Name wird beim Beitritt eingetragen.
  run joinSetsOwnNameTest =
    init
      .then(join(1, "carl"))
      .expect(state.spectators.get(1) == "carl")
}
