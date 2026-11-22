// Deterministische Tests der per-Spieler-Results-Variante.
// Kurze Dauer-Konstanten (3/2/5). Standard-Preamble (2 Spieler):
//   join x2 -> signUp x2 -> 3x tick -> startCountdown -> 2x tick -> startRound(text)
// Nach roundEnd: players=Map(), resultsViewers=alte players, phase=Results.
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

  // ---- Preamble-Helfer: deterministisch in eine Runde ----
  // (Kein shared helper möglich — Quint-Tests sind flache run-Definitionen.)

  // ---- Per-Spieler backToLobby ----

  // Ein Viewer verlässt Results -> Phase bleibt Results, er wird Zuschauer.
  run backToLobbyOneLeavesPhaseStaysResultsTest =
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
        state.phase == Results,
        state.resultsViewers.keys() == Set(1, 2),
        state.players.keys() == Set(),
      })
      .then(backToLobby(1))
      .expect(and {
        state.phase == Results,
        state.resultsViewers.keys() == Set(2),
        state.spectators.keys() == Set(1),
        state.spectators.get(1) == "ann",
      })

  // Letzter Viewer verlässt Results -> Phase Lobby.
  run backToLobbyLastLeavesPhaseGoesLobbyTest =
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
      .then(backToLobby(1))
      .then(backToLobby(2))
      .expect(and {
        state.phase == Lobby,
        state.resultsViewers.keys() == Set(),
        state.spectators.keys() == Set(1, 2),
        state.timeRemaining == LOBBY_DURATION,
      })

  // backToLobby nur in Results (in Lobby blockiert).
  run backToLobbyBlockedOutsideResultsTest =
    init
      .then(join(1, "ann"))
      .then(backToLobby(1).fail())

  // ---- Neue Runde während Results ----

  // signUp in Results erlaubt (Lobby offen): neuer Spieler, Results bleibt.
  run signUpAllowedInResultsTest =
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
      .then(signUp(3))
      .expect(and {
        state.phase == Results,
        state.players.keys() == Set(3),
        state.resultsViewers.keys() == Set(1, 2),
      })

  // Neue Runde startet während Results: resultsViewers werden Zuschauer.
  run newGameDuringResultsPullsViewersToSpectatorsTest =
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
      .then(signUp(3))
      .then(join(4, "dora"))
      .then(signUp(4))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .expect(and {
        state.phase == Countdown,
        state.resultsViewers.keys() == Set(),
        state.spectators.keys() == Set(1, 2),
        state.players.keys() == Set(3, 4),
      })

  // Nach dem Countdown-Ende: Runde startet, resultsViewers leer, alte Viewers tippen NICHT.
  run pulledViewersAreSpectatorsNotPlayersTest =
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
        state.resultsViewers.keys() == Set(),
      })

  // ---- resultsViewers nur in Results ----

  // Nach roundEnd: resultsViewers gefüllt, players leer.
  run resultsViewersPopulatedAfterRoundEndTest =
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
        state.resultsViewers.keys() == Set(1, 2),
        state.players.keys() == Set(),
        state.phase == Results,
      })

  // Nach startCountdown (aus Results): resultsViewers geleert.
  run resultsViewersClearedOnNewGameTest =
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
      .then(signUp(3))
      .then(join(4, "dora"))
      .then(signUp(4))
      .then(3.reps(i => tick))
      .then(startCountdown)
      .expect(state.resultsViewers.keys() == Set())

  // ---- Timer in Results ----

  // Lobby-Timer tickt in Results (nur bei >=1 Spieler im Roster).
  run lobbyTimerTicksInResultsTest =
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
      .then(signUp(3))
      .then(tick)
      .expect(state.timeRemaining == LOBBY_DURATION - 1)

  // Ohne Spieler im Roster tickt der Timer in Results nicht.
  run lobbyTimerIdleInResultsNoPlayersTest =
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
      .then(tick.fail())

  // ---- Disconnect in Results ----

  // Results-Viewer disconnectet -> wie backToLobby (Zuschauer).
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
      .then(5.reps(i => tick))
      .then(roundEnd(1))
      .then(disconnect(1))
      .expect(and {
        state.phase == Results,
        state.resultsViewers.keys() == Set(2),
        state.spectators.keys() == Set(),
      })

  // Letzter Results-Viewer disconnectet -> Phase Lobby.
  run disconnectLastResultsViewerGoesLobbyTest =
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
      .then(disconnect(1))
      .then(disconnect(2))
      .expect(and {
        state.phase == Lobby,
        state.resultsViewers.keys() == Set(),
      })

  // ---- Winner in Results ----

  // Winner wird bei roundEnd gesetzt und bleibt in Results.
  run winnerSetInResultsTest =
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
      .then(5.reps(i => tick))
      .then(roundEnd(1))
      .expect(state.winner == 1)

  // Winner disconnectet in Results -> winner wird NO_PID.
  run winnerDisconnectGoesNoPidTest =
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
      .expect(state.winner == NO_PID)
}
