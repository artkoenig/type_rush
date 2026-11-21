// Blind-Typing-Rennen: reine, deterministische Event-Engine (single test seam).
// Kein Host: Die Lobby ist immer offen. Zuschauer melden sich per signUp an
// ("Ich spiele mit!"). Ein 30s-Teilnahme-Timer + 5s-Countdown starten die
// Runde automatisch; nach den Results wird neu angemeldet (Players -> Zuschauer).
module blindTyping {
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
  type Phase = Lobby | Countdown | Round | Results
  type PlayerState = {nickname: str, cursor: int, correct: int, errors: int}
  type EngineState = {
    phase: Phase,
    players: int -> PlayerState,
    spectators: int -> str,
    winner: int,
    timeRemaining: int,
    roundText: List[str],
    roundNumber: int
  }

  // ---- Konstanten ----
  pure val NO_PID: int = -1
  pure val EMPTY_PS: PlayerState = {nickname: "", cursor: 0, correct: 0, errors: 0}

  // ---- Abgeleitete Werte ----
  pure def connected(s: EngineState): Set[int] =
    s.players.keys().union(s.spectators.keys())

  pure def rosterSize(s: EngineState): int = s.players.keys().size()

  // ---- Scoring ----
  pure def score(s: EngineState, pid: int): int =
    s.players.get(pid).correct * 10 - s.players.get(pid).errors * 2

  pure def accuracy(s: EngineState, pid: int): int =
    if (s.players.get(pid).correct + s.players.get(pid).errors == 0) { 100 }
    else { s.players.get(pid).correct * 100 / (s.players.get(pid).correct + s.players.get(pid).errors) }

  pure def wpm(s: EngineState, pid: int): int =
    if (ROUND_DURATION - s.timeRemaining == 0) { 0 }
    else { s.players.get(pid).correct * 12 / (ROUND_DURATION - s.timeRemaining) }

  pure def finished(s: EngineState, pid: int): bool =
    s.players.get(pid).cursor >= s.roundText.length()

  // q schlägt p: höherer Score, Tiebreak: mehr korrekte Zeichen.
  pure def beats(s: EngineState, q: int, p: int): bool =
    q != p and (score(s, q) > score(s, p) or
      (score(s, q) == score(s, p) and s.players.get(q).correct > s.players.get(p).correct))

  pure def winnerSet(s: EngineState): Set[int] =
    s.players.keys().filter(p => s.players.keys().filter(q => beats(s, q, p)).size() == 0)

  pure def winnerCand(s: EngineState): Set[int] =
    if (s.players.keys().size() == 0) { Set(NO_PID) } else { winnerSet(s) }

  var state: EngineState

  // ---- Invarianten ----
  run rosterBounded = state.players.keys().size() <= MAX_PLAYERS
  run disjoint = state.players.keys().forall(p => p.in(state.spectators.keys()) == false)
  run winnerValid = state.winner == NO_PID or state.winner.in(connected(state))
  run timeBounded =
    (state.phase == Lobby and state.timeRemaining >= 0 and state.timeRemaining <= LOBBY_DURATION) or
    (state.phase == Countdown and state.timeRemaining >= 0 and state.timeRemaining <= COUNTDOWN_DURATION) or
    (state.phase == Round and state.timeRemaining >= 0 and state.timeRemaining <= ROUND_DURATION) or
    (state.phase == Results and state.timeRemaining == 0)
  run connectedSubset = connected(state).forall(p => p.in(PIDS))
  run spectatorNicknames = state.spectators.keys().forall(p => state.spectators.get(p).in(NICKNAMES))
  run playerNicknames = state.players.keys().forall(p => state.players.get(p).nickname.in(NICKNAMES))
  run cursorBounded = state.players.keys().forall(p =>
    state.players.get(p).cursor >= 0 and state.players.get(p).cursor <= state.roundText.length())
  run nonNegative = state.players.keys().forall(p =>
    state.players.get(p).correct >= 0 and state.players.get(p).errors >= 0)

  // ---- Witnesses ----
  val reachedCountdown = state.phase == Countdown
  val reachedRound = state.phase == Round
  val reachedResults = state.phase == Results
  val someSpectator = state.spectators.keys().size() > 0
  val somePlayer = state.players.keys().size() > 0
  val someWinner = state.winner != NO_PID
  val secondRound = state.roundNumber >= 2
  val soloRound = state.phase == Round and state.players.keys().size() == 1
  val emptyResults = state.phase == Results and state.players.keys().size() == 0
  val fullRoster = state.players.keys().size() == MAX_PLAYERS

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

  // signUp: Zuschauer -> Spieler ("Ich spiele mit!"). Nur Lobby, Roster nicht voll.
  // Erster Spieler lädt den 30s-Teilnahme-Timer.
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

  // tick: Timer tickt runter. Lobby nur bei >=1 Spieler; Countdown; Round.
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

  // Countdown starten: Roster voll ODER Timer abgelaufen mit >=2 Spielern.
  pure def canStartCountdown(s: EngineState): bool =
    s.phase == Lobby and (s.players.keys().size() == MAX_PLAYERS or
      (s.timeRemaining == 0 and s.players.keys().size() >= 2))
  action startCountdown = all {
    canStartCountdown(state),
    state' = {...state, phase: Countdown, timeRemaining: COUNTDOWN_DURATION}
  }

  // Runde starten: automatisch nach Countdown-Ende. Text wird vom Aufrufer
  // gewählt (step: nondet aus TEXTS; Tests: deterministisch).
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

  // Runde beenden: Zeit abgelaufen ODER alle Spieler fertig. Winner wird
  // aus winnerCand gezogen (Singleton bei 1 Spieler -> deterministisch).
  pure def canRoundEnd(s: EngineState, w: int): bool =
    s.phase == Round and w.in(winnerCand(s)) and (s.timeRemaining == 0 or
      s.players.keys().forall(p => finished(s, p)))
  pure def applyRoundEnd(s: EngineState, w: int): EngineState =
    {...s, phase: Results, winner: w, timeRemaining: 0}
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

  // disconnect: aus players ODER spectators. Leerer Roster in Lobby -> Timer neu laden.
  pure def canDisconnect(s: EngineState, pid: int): bool = pid.in(connected(s))
  pure def applyDisconnect(s: EngineState, pid: int): EngineState = {
    ...s,
    players: s.players.keys().filter(x => x != pid).mapBy(x => s.players.get(x)),
    spectators: s.spectators.keys().filter(x => x != pid).mapBy(x => s.spectators.get(x)),
    winner: if (s.winner == pid) { NO_PID } else { s.winner },
    timeRemaining: if (s.phase == Lobby and s.players.keys().filter(x => x != pid).size() == 0) { LOBBY_DURATION } else { s.timeRemaining }
  }
  action disconnect(pid: int): bool = all {
    canDisconnect(state, pid),
    state' = applyDisconnect(state, pid),
  }

  // Results -> Lobby: Spieler werden wieder Zuschauer (müssen neu signUp).
  pure def canBackToLobby(s: EngineState): bool = s.phase == Results
  pure def applyBackToLobby(s: EngineState): EngineState = {
    ...s,
    phase: Lobby,
    players: Map(),
    spectators: s.players.keys().fold(s.spectators, (acc, pid) => acc.put(pid, s.players.get(pid).nickname)),
    winner: NO_PID,
    timeRemaining: LOBBY_DURATION
  }
  action backToLobby = all {
    canBackToLobby(state),
    state' = applyBackToLobby(state)
  }

  // init: Lobby offen, leeres Roster, Timer geladen (LOBBY_DURATION), läuft erst ab 1. Spieler.
  action init = state' = {
    phase: Lobby,
    players: Map(),
    spectators: Map(),
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
      backToLobby,
    }
  }
}
