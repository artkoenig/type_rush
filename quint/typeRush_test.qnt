// Deterministische Tests des neuen Modells (Results = Lobby-Spezialfall, keine
// Results-Phase mehr). Kurze Dauer-Konstanten (3/2/5). Standard-Preamble (2 Spieler):
//   join x2 -> signUp x2 -> 3x tick -> startCountdown -> 2x tick -> startRound(text)
// Nach roundEnd: phase=Lobby, players=Map(), spectators=alte players,
// lastRoundResults=alte players, winner gesetzt.
module typeRush_test {
  import typeRush(
    PIDS = Set(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    MAX_PLAYERS = 8,
    LOBBY_DURATION = 3,
    COUNTDOWN_DURATION = 2,
    ROUND_DURATION = 5,
    TEXTS = Set(List("a", "b", "c"), List("d", "e", "f", "g", "h")),
    KEYS = Set("a", "b", "c", "d", "e", "f", "g", "h", "x"),
    NICKNAMES = Set("ann", "ben", "carl", "dora", "eve", "fred", "gus", "hal", "ida", "joe")
  ).* from "./typeRush"

  // ---- roundEnd -> Lobby (kein Results) ----

  // Nach roundEnd: Phase Lobby, Spieler -> Zuschauer, Tabelle = alte Spieler, Winner gesetzt.
  run roundEndGoesToLobbyTest =
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
      .expect(and {
        state.phase == Lobby,
        state.players.keys() == Set(),
        state.spectators.keys() == Set(1, 2),
        state.spectators.get(1) == "ann",
        state.spectators.get(2) == "ben",
        state.lastRoundResults.keys() == Set(1, 2),
        state.winner == 1,
        state.timeRemaining == LOBBY_DURATION,
      })

  // ---- Tabelle + Winner werden beim neuen Spiel geleert ----

  // Neue Runde in der Lobby (mit Tabelle): startCountdown leert Tabelle + Winner.
  run resultsClearedOnNewGameTest =
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
      .expect(and {
        state.phase == Lobby,
        state.lastRoundResults.keys() == Set(1, 2),
        state.winner == 1,
      })
      .then(join(3, "carl"))
      .then(signUp(3))
      .then(join(4, "dora"))
      .then(signUp(4))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .expect(and {
        state.phase == Countdown,
        state.lastRoundResults.keys() == Set(),
        state.winner == NO_PID,
        state.players.keys() == Set(3, 4),
        state.spectators.keys() == Set(1, 2),
      })

  // ---- Alte Spieler sind Zuschauer der neuen Runde ----

  // Zweite Runde: alte Spieler (1,2) tippen NICHT mit, sie schauen zu; Tabelle leer.
  run formerPlayersAreSpectatorsDuringRoundTest =
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
      .then(join(3, "carl"))
      .then(signUp(3))
      .then(join(4, "dora"))
      .then(signUp(4))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .then(2.reps(i => tick))
      .then(startRound(List("d", "e", "f", "g", "h")))
      .expect(and {
        state.phase == Round,
        state.roundNumber == 2,
        state.players.keys() == Set(3, 4),
        state.spectators.keys() == Set(1, 2),
        state.lastRoundResults.keys() == Set(),
      })

  // ---- Tabelle ist von der Anwesenheit entkoppelt ----

  // Zuschauer (ex-Spieler) verlässt die Lobby -> Tabelle zeigt ihn weiterhin.
  run tablePersistsWhenSpectatorsLeaveTest =
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
      .then(disconnect(2))
      .expect(and {
        state.spectators.keys() == Set(1),
        state.lastRoundResults.keys() == Set(1, 2),
        state.winner == 1,
      })

  // ---- Winner-Lebenszyklus ----

  // Winner wird bei roundEnd gesetzt und beim Disconnect auf NO_PID zurückgesetzt.
  run winnerClearedOnDisconnectTest =
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
      .expect(state.winner == 1)
      .then(disconnect(1))
      .expect(state.winner == NO_PID)

  // ---- signUp nur in der Lobby ----

  // signUp in der Lobby: Zuschauer -> Spieler.
  run signUpOnlyInLobbyTest =
    init
      .then(join(1, "ann"))
      .then(signUp(1))
      .expect(and {
        state.phase == Lobby,
        state.players.keys() == Set(1),
        state.spectators.keys() == Set(),
      })

  // signUp in der Runde blockiert (Phase != Lobby).
  run signUpBlockedInRoundTest =
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

  // ---- Disconnect ----

  // Zuschauer disconnectet -> Spieler bleiben unberührt.
  run spectatorDisconnectTest =
    init
      .then(join(1, "ann"))
      .then(join(2, "ben"))
      .then(signUp(1))
      .then(signUp(2))
      .then(join(3, "carl"))
      .then(disconnect(3))
      .expect(and {
        state.spectators.keys() == Set(),
        state.players.keys() == Set(1, 2),
      })

  // Letzter Spieler verlässt die Lobby -> Lobby-Timer wird neu geladen.
  run lastPlayerDisconnectResetsTimerTest =
    init
      .then(join(1, "ann"))
      .then(signUp(1))
      .then(2.reps(i => tick))
      .expect(state.timeRemaining == LOBBY_DURATION - 2)
      .then(disconnect(1))
      .expect(state.timeRemaining == LOBBY_DURATION)
}
