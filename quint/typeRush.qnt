// TYPE RUSH — formales Modell (Quint).
//
// Phasen-Zyklus:  Lobby -> Countdown -> Round -> Lobby -> ...
// Es gibt KEINE separate "Results"-Phase mehr. Die Highscore-Tabelle ("Results")
// ist ein rein client-seitiger Blick auf die Lobby, hinterlegt durch das Feld
// `lastRoundResults` (die Spieler der zuletzt beendeten Runde, mit ihren Scores).
//
// Nach jeder Runde werden ALLE Spieler zu Zuschauern (sie sehen die Tabelle in der
// Lobby). Jeder entscheidet individuell, ob er beim nächsten Spiel mitmacht (signUp)
// oder zuschaut. Die Tabelle ist fixiert (sie schrumpft NICHT, wenn Leute die Lobby
// verlassen) und wird beim Start des nächsten Spiels (startCountdown) geleert.
//
// Engine-State:
// - players:          aktive Spieler der laufenden Runde (tippen mit).
// - spectators:       Zuschauer (sehen zu, tippen nicht) — inkl. der Spieler der
//                     letzten Runde, die nach roundEnd zu Zuschauern wurden.
// - lastRoundResults: Scores der zuletzt beendeten Runde (Hintergrund der
//                     Highscore-Tabelle); nur in der Lobby gefüllt, sonst leer.
// - winner:           Gewinner der letzten Runde; nur in der Lobby gesetzt, sonst NO_PID.
module typeRush {
  // ---- Module-Parameter (via import instanziert) ----
  const PIDS: Set[int]
  const MAX_PLAYERS: int
  const LOBBY_DURATION: int
  const COUNTDOWN_DURATION: int
  const ROUND_DURATION: int
  const TEXTS: Set[List[str]]
  const KEYS: Set[str]
  const NICKNAMES: Set[str]

  // ---- Typen ----
  type Phase = Lobby | Countdown | Round
  type PlayerState = {nickname: str, cursor: int, correct: int, errors: int}
  type EngineState = {
    phase: Phase,
    players: int -> PlayerState,
    spectators: int -> str,
    lastRoundResults: int -> PlayerState,
    winner: int,
    timeRemaining: int,
    roundText: List[str],
    roundNumber: int
  }

  // ---- Konstanten ----
  pure val NO_PID: int = -1
  pure val EMPTY_PS: PlayerState = {nickname: "", cursor: 0, correct: 0, errors: 0}

  // ---- Abgeleitete Werte ----
  // Verbundene Clients: Spieler + Zuschauer.
  pure def connected(s: EngineState): Set[int] =
    s.players.keys().union(s.spectators.keys())

  // Aktive Racer der laufenden Runde = die Spieler (es gibt keine Results-Phase mehr).
  pure def racers(s: EngineState): int -> PlayerState = s.players

  // Alle getrackten Spieler-Zustände: aktive Spieler + letzte Runde (für Invarianten).
  pure def allRacers(s: EngineState): Set[int] = s.players.keys().union(s.lastRoundResults.keys())

  // Ein Spieler-Zustand aus players ODER lastRoundResults (für Invarianten).
  pure def racerState(s: EngineState, pid: int): PlayerState =
    if (pid.in(s.players.keys())) { s.players.get(pid) } else { s.lastRoundResults.get(pid) }

  // ---- Scoring ----
  pure def score(s: EngineState, pid: int): int =
    racers(s).get(pid).correct * 10 - racers(s).get(pid).errors * 2

  pure def finished(s: EngineState, pid: int): bool =
    racers(s).get(pid).cursor >= s.roundText.length()

  // q schlägt p: höherer Score, Tiebreak: mehr korrekte Zeichen.
  pure def beats(s: EngineState, q: int, p: int): bool =
    q != p and (score(s, q) > score(s, p) or
      (score(s, q) == score(s, p) and racers(s).get(q).correct > racers(s).get(p).correct))

  pure def winnerSet(s: EngineState): Set[int] =
    racers(s).keys().filter(p => racers(s).keys().filter(q => beats(s, q, p)).size() == 0)

  pure def winnerCand(s: EngineState): Set[int] =
    if (racers(s).keys().size() == 0) { Set(NO_PID) } else { winnerSet(s) }

  var state: EngineState

  // ---- Invarianten ----
  run rosterBounded = state.players.keys().size() <= MAX_PLAYERS
  run disjointPS = state.players.keys().forall(p => p.in(state.spectators.keys()) == false)
  run resultsSubset = state.lastRoundResults.keys().forall(p => p.in(PIDS))
  // Die Tabelle ist ein Lobby-Phänomen: außerhalb der Lobby (Countdown/Round) leer.
  run resultsOnlyInLobby = state.phase != Lobby implies state.lastRoundResults.keys().size() == 0
  run winnerValid = state.winner == NO_PID or state.winner.in(connected(state))
  run timeBounded =
    (state.phase == Lobby and state.timeRemaining >= 0 and state.timeRemaining <= LOBBY_DURATION) or
    (state.phase == Countdown and state.timeRemaining >= 0 and state.timeRemaining <= COUNTDOWN_DURATION) or
    (state.phase == Round and state.timeRemaining >= 0 and state.timeRemaining <= ROUND_DURATION)
  run connectedSubset = connected(state).forall(p => p.in(PIDS))
  run spectatorNicknames = state.spectators.keys().forall(p => state.spectators.get(p).in(NICKNAMES))
  run playerNicknames = state.players.keys().forall(p => state.players.get(p).nickname.in(NICKNAMES))
  run resultsNicknames = state.lastRoundResults.keys().forall(p => state.lastRoundResults.get(p).nickname.in(NICKNAMES))
  run cursorBounded = allRacers(state).forall(p =>
    racerState(state, p).cursor >= 0 and racerState(state, p).cursor <= state.roundText.length())
  run nonNegative = allRacers(state).forall(p =>
    racerState(state, p).correct >= 0 and racerState(state, p).errors >= 0)

  // ---- Witnesses ----
  val reachedCountdown = state.phase == Countdown
  val reachedRound = state.phase == Round
  val someSpectator = state.spectators.keys().size() > 0
  val somePlayer = state.players.keys().size() > 0
  val someWinner = state.winner != NO_PID
  val secondRound = state.roundNumber >= 2
  val fullRoster = state.players.keys().size() == MAX_PLAYERS
  // "Results als Lobby-Spezialfall": Highscore-Tabelle sichtbar in der Lobby.
  val resultsAvailable = state.lastRoundResults.keys().size() > 0
  val lobbyWithResults = state.phase == Lobby and state.lastRoundResults.keys().size() > 0
  // Kern-Szenario: Tabelle sichtbar UND neue Spieler melden sich für das nächste Spiel an.
  val lobbyWithResultsAndSignups = state.phase == Lobby and state.lastRoundResults.keys().size() > 0 and state.players.keys().size() > 0
  // Zuschauer während einer Runde (z.B. die Spieler der letzten Runde).
  val spectatorsDuringRound = state.phase == Round and state.spectators.keys().size() > 0

  // ---- Actions ----

  // join: ein (neuer) Player verbindet sich als Zuschauer. In jeder Phase erlaubt.
  pure def canJoin(s: EngineState, pid: int, nick: str): bool =
    pid.in(PIDS) and nick.in(NICKNAMES) and pid.in(connected(s)) == false
  pure def applyJoin(s: EngineState, pid: int, nick: str): EngineState =
    {...s, spectators: s.spectators.put(pid, nick)}
  action join(pid: int, nick: str): bool = all {
    canJoin(state, pid, nick),
    state' = applyJoin(state, pid, nick),
  }

  // signUp: Zuschauer -> Spieler ("Ich spiele mit!"). Nur in der Lobby.
  // Erster Spieler lädt den Teilnahme-Timer.
  pure def canSignUp(s: EngineState, pid: int): bool =
    s.phase == Lobby and pid.in(s.spectators.keys()) and s.players.keys().size() < MAX_PLAYERS
  pure def applySignUp(s: EngineState, pid: int): EngineState = {
    ...s,
    players: s.players.put(pid, {...EMPTY_PS, nickname: s.spectators.get(pid)}),
    spectators: s.spectators.keys().filter(x => x != pid).mapBy(x => s.spectators.get(x)),
    timeRemaining: if (s.players.keys().size() == 0) { LOBBY_DURATION } else { s.timeRemaining }
  }
  action signUp(pid: int): bool = all {
    canSignUp(state, pid),
    state' = applySignUp(state, pid),
  }

  // tick: Timer tickt runter. Round; Countdown; Lobby (nur bei >=1 Spieler).
  pure def canTick(s: EngineState): bool =
    (s.phase == Round and s.timeRemaining > 0) or
    (s.phase == Countdown and s.timeRemaining > 0) or
    (s.phase == Lobby and s.timeRemaining > 0 and s.players.keys().size() > 0)
  pure def applyTick(s: EngineState): EngineState = {...s, timeRemaining: s.timeRemaining - 1}
  action tick = all {
    canTick(state),
    state' = applyTick(state),
  }

  // Timer abgelaufen mit <2 Spielern -> zurücksetzen, Lobby wartet weiter.
  action resetLobbyTimer = all {
    state.phase == Lobby,
    state.timeRemaining == 0,
    state.players.keys().size() < 2,
    state' = {...state, timeRemaining: LOBBY_DURATION}
  }

  // Countdown starten: Roster voll ODER Timer abgelaufen mit >=2 Spielern. Nur aus der Lobby.
  // Tabelle + Gewinner werden geleert (beides ist ein Lobby-Phänomen).
  pure def canStartCountdown(s: EngineState): bool =
    s.phase == Lobby and (s.players.keys().size() == MAX_PLAYERS or
      (s.timeRemaining == 0 and s.players.keys().size() >= 2))
  pure def applyStartCountdown(s: EngineState): EngineState = {
    ...s,
    phase: Countdown,
    timeRemaining: COUNTDOWN_DURATION,
    lastRoundResults: Map(),
    winner: NO_PID
  }
  action startCountdown = all {
    canStartCountdown(state),
    state' = applyStartCountdown(state),
  }

  // Runde starten: automatisch nach Countdown-Ende.
  pure def canStartRound(s: EngineState, text: List[str]): bool =
    s.phase == Countdown and s.timeRemaining == 0 and text.in(TEXTS)
  pure def applyStartRound(s: EngineState, text: List[str]): EngineState = {
    ...s,
    players: s.players.keys().mapBy(pid => {...s.players.get(pid), cursor: 0, correct: 0, errors: 0}),
    phase: Round,
    timeRemaining: ROUND_DURATION,
    roundText: text,
    roundNumber: s.roundNumber + 1,
    winner: NO_PID
  }
  action startRound(text: List[str]): bool = all {
    canStartRound(state, text),
    state' = applyStartRound(state, text),
  }

  // Runde beenden: Zeit abgelaufen ODER alle Spieler fertig. Alle Spieler werden zu
  // Zuschauern; ihre Scores gehen in lastRoundResults (Highscore-Tabelle der Lobby);
  // das Roster leert sich; der Lobby-Timer wird geladen. Phase -> Lobby.
  pure def canRoundEnd(s: EngineState, w: int): bool =
    s.phase == Round and w.in(winnerCand(s)) and (s.timeRemaining == 0 or
      s.players.keys().forall(p => finished(s, p)))
  pure def applyRoundEnd(s: EngineState, w: int): EngineState = {
    ...s,
    phase: Lobby,
    winner: w,
    timeRemaining: LOBBY_DURATION,
    lastRoundResults: s.players,
    players: Map(),
    spectators: s.players.keys().fold(s.spectators, (acc, pid) => acc.put(pid, s.players.get(pid).nickname))
  }
  action roundEnd(w: int): bool = all {
    canRoundEnd(state, w),
    state' = applyRoundEnd(state, w),
  }

  // Tastenanschlag: nur in Round, Spieler noch nicht fertig.
  pure def canKeystroke(s: EngineState, pid: int, key: str): bool =
    s.phase == Round and pid.in(s.players.keys()) and key.in(KEYS) and finished(s, pid) == false
  pure def applyKeystroke(s: EngineState, pid: int, key: str): EngineState = {
    ...s,
    players: s.players.set(pid, {
      ...s.players.get(pid),
      cursor: s.players.get(pid).cursor + 1,
      correct: if (key == s.roundText.nth(s.players.get(pid).cursor)) { s.players.get(pid).correct + 1 } else { s.players.get(pid).correct },
      errors: if (key == s.roundText.nth(s.players.get(pid).cursor)) { s.players.get(pid).errors } else { s.players.get(pid).errors + 1 }
    })
  }
  action keystroke(pid: int, key: str): bool = all {
    canKeystroke(state, pid, key),
    state' = applyKeystroke(state, pid, key),
  }

  // disconnect: aus players ODER spectators. Gewinner disconnectet -> NO_PID.
  // Letzter Spieler verlässt die Lobby -> Lobby-Timer neu laden.
  pure def canDisconnect(s: EngineState, pid: int): bool = pid.in(connected(s))
  pure def applyDisconnect(s: EngineState, pid: int): EngineState = {
    ...s,
    players: s.players.keys().filter(x => x != pid).mapBy(x => s.players.get(x)),
    spectators: s.spectators.keys().filter(x => x != pid).mapBy(x => s.spectators.get(x)),
    winner: if (s.winner == pid) { NO_PID } else { s.winner },
    timeRemaining: if (s.phase == Lobby and pid.in(s.players.keys()) and s.players.keys().filter(x => x != pid).size() == 0) { LOBBY_DURATION } else { s.timeRemaining }
  }
  action disconnect(pid: int): bool = all {
    canDisconnect(state, pid),
    state' = applyDisconnect(state, pid),
  }

  // init: Lobby offen, leeres Roster, leere Tabelle, Timer geladen, läuft erst ab 1. Spieler.
  action init = state' = {
    phase: Lobby,
    players: Map(),
    spectators: Map(),
    lastRoundResults: Map(),
    winner: NO_PID,
    timeRemaining: LOBBY_DURATION,
    roundText: List(),
    roundNumber: 0
  }

  action step = {
    nondet pid = PIDS.oneOf()
    nondet nick = NICKNAMES.oneOf()
    nondet key = KEYS.oneOf()
    nondet text = TEXTS.oneOf()
    nondet w = winnerCand(state).oneOf()
    any {
      join(pid, nick),
      signUp(pid),
      tick,
      resetLobbyTimer,
      startCountdown,
      startRound(text),
      roundEnd(w),
      keystroke(pid, key),
      disconnect(pid),
    }
  }
}
