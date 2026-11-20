// Blind-Typing-Rennen: reine, deterministische Event-Engine (single test seam).
// Modelliert docs/spec.md. Ein Actor, ein State-Record, dünne guarded Actions.
//
// Redesign: Zuschauer (unbegrenzt), Roster-Assembly (≤ MAX_PLAYERS),
// Winner-Rotation via queueHead, permanentes Verlassen (Zuschauer → raus).
module blindTyping {
  // ---- Module-Parameter (via import instanziert) ----
  const HOST: int
  const PIDS: Set[int]
  const MAX_PLAYERS: int
  const DURATIONS: Set[int]
  const TEXTS: Set[List[str]]
  const KEYS: Set[str]
  const NICKNAMES: Set[str]

  // ---- Typen ----
  type Phase = WaitingForNewSession | Lobby | Round | Results
  type PlayerState = {nickname: str, cursor: int, correct: int, errors: int}
  type EngineState = {
    phase: Phase,
    players: int -> PlayerState,
    spectators: int -> str,
    winner: int,
    queueHead: int,
    roundDuration: int,
    timeRemaining: int,
    roundText: List[str],
    roundNumber: int
  }

  // ---- Konstanten ----
  pure val DEFAULT_DURATION: int = 60
  pure val NO_PID: int = -1
  pure val EMPTY_PS: PlayerState = {nickname: "", cursor: 0, correct: 0, errors: 0}

  // ---- Abgeleitete Werte ----
  pure def connected(s: EngineState): Set[int] =
    s.players.keys().union(s.spectators.keys())

  pure def isHost(s: EngineState, pid: int): bool = pid == HOST
  pure def isQueueHead(s: EngineState, pid: int): bool = pid == s.queueHead

  // ---- Scoring ----
  pure def score(s: EngineState, pid: int): int =
    s.players.get(pid).correct * 10 - s.players.get(pid).errors * 2

  pure def accuracy(s: EngineState, pid: int): int =
    if (s.players.get(pid).correct + s.players.get(pid).errors == 0) { 100 }
    else { s.players.get(pid).correct * 100 / (s.players.get(pid).correct + s.players.get(pid).errors) }

  pure def wpm(s: EngineState, pid: int): int =
    if (s.roundDuration - s.timeRemaining == 0) { 0 }
    else { s.players.get(pid).correct * 12 / (s.roundDuration - s.timeRemaining) }

  pure def finished(s: EngineState, pid: int): bool =
    s.players.get(pid).cursor >= s.roundText.length()

  // q schlägt p: höherer Score, Tiebreak: mehr korrekte Zeichen.
  pure def beats(s: EngineState, q: int, p: int): bool =
    q != p and (score(s, q) > score(s, p) or
      (score(s, q) == score(s, p) and s.players.get(q).correct > s.players.get(p).correct))

  // Menge der Spieler, die niemand schlägt (bei eindeutiger Ordnung: {Winner}).
  pure def winnerSet(s: EngineState): Set[int] =
    s.players.keys().filter(p => s.players.keys().filter(q => beats(s, q, p)).size() == 0)

  // Kandidaten für nondet: nie leer (falls kein Spieler: {NO_PID}).
  pure def winnerCand(s: EngineState): Set[int] =
    if (s.players.keys().size() == 0) { Set(NO_PID) } else { winnerSet(s) }

  // Kandidaten für queueHead-Rotation: nie leer.
  pure def queueHeadCand(s: EngineState): Set[int] =
    if (connected(s).size() == 0) { Set(NO_PID) } else { connected(s) }

  // ---- State ----
  var state: EngineState

  // ---- Invarianten ----
  run rosterBounded = state.players.keys().size() <= MAX_PLAYERS
  run disjoint = state.players.keys().forall(p => p.in(state.spectators.keys()) == false)
  run queueHeadValid = state.queueHead == NO_PID or state.queueHead.in(connected(state))
  run winnerValid = state.winner == NO_PID or state.winner.in(connected(state))
  run timeBounded = state.timeRemaining >= 0 and state.timeRemaining <= state.roundDuration
  run connectedSubset = connected(state).forall(p => p.in(PIDS))
  run spectatorNicknames = state.spectators.keys().forall(p => state.spectators.get(p).in(NICKNAMES))
  run playerNicknames = state.players.keys().forall(p => state.players.get(p).nickname.in(NICKNAMES))
  run cursorBounded = state.players.keys().forall(p =>
    state.players.get(p).cursor >= 0 and state.players.get(p).cursor <= state.roundText.length())
  run nonNegative = state.players.keys().forall(p =>
    state.players.get(p).correct >= 0 and state.players.get(p).errors >= 0)

  // ---- Witnesses ----
  val reachedWaiting = state.phase == WaitingForNewSession
  val reachedLobby = state.phase == Lobby
  val reachedRound = state.phase == Round
  val reachedResults = state.phase == Results
  val someSpectator = state.spectators.keys().size() > 0
  val somePlayer = state.players.keys().size() > 0
  val someWinner = state.winner != NO_PID
  val secondRound = state.roundNumber >= 2
  val soloRound = state.phase == Round and state.players.keys().size() == 1
  val emptyResults = state.phase == Results and state.players.keys().size() == 0

  // ---- Actions ----

  // Beitritt: jeder beliebige Pid wird Zuschauer (alle Phasen).
  pure def canJoin(s: EngineState, pid: int, nick: str): bool =
    pid.in(PIDS) and nick.in(NICKNAMES) and pid.in(connected(s)) == false

  pure def applyJoin(s: EngineState, pid: int, nick: str): EngineState =
    {...s,
     spectators: s.spectators.put(pid, nick),
     queueHead: if (s.queueHead == NO_PID) { pid } else { s.queueHead }}

  action join(pid: int, nick: str): bool = all {
    canJoin(state, pid, nick),
    state' = applyJoin(state, pid, nick),
  }

  // Neue Session: Host mit Start-Recht, aus Waiting.
  pure def canStartSession(s: EngineState, pid: int): bool =
    s.phase == WaitingForNewSession and isHost(s, pid) and pid.in(connected(s)) and isQueueHead(s, pid)

  pure def applyStartSession(s: EngineState): EngineState = {...s, phase: Lobby}

  action startSession(pid: int): bool = all {
    canStartSession(state, pid),
    state' = applyStartSession(state),
  }

  // Dauer setzen: nur Host in Lobby.
  pure def canSetDuration(s: EngineState, pid: int, d: int): bool =
    s.phase == Lobby and isHost(s, pid) and d.in(DURATIONS)

  pure def applySetDuration(s: EngineState, d: int): EngineState = {...s, roundDuration: d}

  action setDuration(pid: int, d: int): bool = all {
    canSetDuration(state, pid, d),
    state' = applySetDuration(state, d),
  }

  // Runde starten: Host in Lobby. Roster = alle Zuschauer (∅ wenn keiner).
  pure def canStartRound(s: EngineState, pid: int, text: List[str]): bool =
    s.phase == Lobby and isHost(s, pid) and text.in(TEXTS)

  pure def applyStartRound(s: EngineState, text: List[str]): EngineState = {
    ...s,
    players: s.spectators.keys().mapBy(pid => {...EMPTY_PS, nickname: s.spectators.get(pid)}),
    spectators: Map(),
    phase: Round,
    timeRemaining: s.roundDuration,
    roundText: text,
    roundNumber: s.roundNumber + 1,
    winner: NO_PID
  }

  action startRound(pid: int, text: List[str]): bool = all {
    canStartRound(state, pid, text),
    state' = applyStartRound(state, text),
  }

  // Tick: Zeit ablaufen, nur in Round.
  pure def canTick(s: EngineState): bool =
    s.phase == Round and s.timeRemaining > 0

  pure def applyTick(s: EngineState): EngineState =
    {...s, timeRemaining: s.timeRemaining - 1}

  action tick = all {
    canTick(state),
    state' = applyTick(state),
  }

  // Runde beenden: wenn Zeit abgelaufen oder alle fertig.
  pure def canRoundEnd(s: EngineState): bool =
    s.phase == Round and (s.timeRemaining == 0 or
      s.players.keys().forall(p => finished(s, p)))

  pure def applyRoundEnd(s: EngineState, w: int): EngineState =
    {...s, phase: Results, winner: w, timeRemaining: 0}

  action roundEnd = {
    nondet w = winnerCand(state).oneOf()
    state' = if (canRoundEnd(state)) { applyRoundEnd(state, w) } else { state }
  }

  // Tastenanschlag: nur in Round, Spieler noch nicht fertig.
  pure def canKeystroke(s: EngineState, pid: int, key: str): bool =
    s.phase == Round and pid.in(s.players.keys()) and key.in(KEYS) and
      finished(s, pid) == false

  pure def applyKeystroke(s: EngineState, pid: int, key: str): EngineState = {
    ...s,
    players: s.players.set(pid, {
      ...s.players.get(pid),
      cursor: s.players.get(pid).cursor + 1,
      correct: if (key == s.roundText.nth(s.players.get(pid).cursor)) {
        s.players.get(pid).correct + 1
      } else { s.players.get(pid).correct },
      errors: if (key == s.roundText.nth(s.players.get(pid).cursor)) {
        s.players.get(pid).errors
      } else { s.players.get(pid).errors + 1 }
    })
  }

  action keystroke(pid: int, key: str): bool = all {
    canKeystroke(state, pid, key),
    state' = applyKeystroke(state, pid, key),
  }

  // Trennung: Spieler ODER Zuschauer, permanent für diese Runde.
  pure def canDisconnect(s: EngineState, pid: int): bool =
    pid.in(connected(s))

  pure def applyDisconnect(s: EngineState, pid: int): EngineState = {
    ...s,
    players: s.players.keys().filter(x => x != pid).mapBy(x => s.players.get(x)),
    spectators: s.spectators.keys().filter(x => x != pid).mapBy(x => s.spectators.get(x)),
    winner: if (s.winner == pid) { NO_PID } else { s.winner },
    queueHead: if (s.queueHead == pid) { NO_PID } else { s.queueHead }
  }

  action disconnect(pid: int): bool = all {
    canDisconnect(state, pid),
    state' = applyDisconnect(state, pid),
  }

  // Session beenden: Results → Waiting, alle Spieler → Zuschauer, Rotation.
  pure def canEndSession(s: EngineState): bool =
    s.phase == Results

  pure def applyEndSession(s: EngineState, newHead: int): EngineState = {
    ...s,
    players: Map(),
    spectators: s.players.keys().mapBy(pid => s.players.get(pid).nickname),
    queueHead: newHead,
    timeRemaining: 0,
    phase: WaitingForNewSession
  }

  action endSession = {
    nondet newHead = queueHeadCand(state).oneOf()
    state' = if (canEndSession(state)) { applyEndSession(state, newHead) } else { state }
  }

  // ---- Init ----
  action init = state' = {
    phase: WaitingForNewSession,
    players: Map(),
    spectators: Map(),
    winner: NO_PID,
    queueHead: NO_PID,
    roundDuration: DEFAULT_DURATION,
    timeRemaining: 0,
    roundText: List(),
    roundNumber: 0
  }

  // ---- Step (nondet-Wrapper für Exploration) ----
  action step = {
    nondet pid = PIDS.oneOf()
    nondet nick = NICKNAMES.oneOf()
    nondet key = KEYS.oneOf()
    nondet text = TEXTS.oneOf()
    nondet dur = DURATIONS.oneOf()
    any {
      join(pid, nick),
      startSession(pid),
      setDuration(pid, dur),
      startRound(pid, text),
      tick,
      roundEnd,
      keystroke(pid, key),
      disconnect(pid),
      endSession,
    }
  }
}
