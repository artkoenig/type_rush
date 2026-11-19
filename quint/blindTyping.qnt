// Blind-Typing-Rennen: reine, deterministische Event-Engine (single test seam).
// Modelliert docs/spec.md. Ein Actor, ein State-Record, dünne guarded Actions.
module blindTyping {
  const HOST: int
  const PLAYERS: Set[int]
  const MAX_PLAYERS: int
  const DURATIONS: Set[int]
  const TEXTS: Set[List[str]]
  const KEYS: Set[str]
  const NICKNAMES: Set[str]

  // ---- Types ----
  // Lebenszyklus: WaitingForNewSession -> Lobby -> Round -> Results ->
  //  WaitingForNewSession -> ...  Ein laufendes Spiel (Round/Results) kann
  //  nicht mehr betreten werden: "kein Join in ein laufendes Spiel".
  type Phase = WaitingForNewSession | Lobby | Round | Results

  type PlayerState = {
    nickname: str,
    cursor: int,
    correct: int,
    errors: int,
  }

  type EngineState = {
    phase: Phase,
    players: int -> PlayerState,
    joinQueue: List[int],
    roundDuration: int,
    timeRemaining: int,
    roundText: List[str],
    roundNumber: int,
    roundStarters: List[int],
  }

  // ---- Constants ----
  pure val DEFAULT_DURATION: int = 60

  // ---- Pure functions ----
  // "Fertig" = Cursor am Textende. (In der Lobby ist der Text leer -> alle
  //  "fertig", aber alle Nutzstellen sind durch phase == Round gesichert.)
  pure def finished(p: PlayerState, text: List[str]): bool =
    p.cursor == text.length()

  // Wertung (Spec-Formel): Genauigkeit^2 * Zeichen/s * 100.
  // langsam+korrekt (10c/0e, 60s -> 16) schlägt schnell+ungenau (12c/6e -> 8).
  pure def score(p: PlayerState, durationSec: int): int = {
    val total = p.correct + p.errors
    if (total == 0 or durationSec <= 0) 0
    else 100 * p.correct * p.correct * p.correct / (total * total * durationSec)
  }

  // Abgeleitete Anzeige-Werte (Live-Leaderboard / eigene Stats) — nicht gespeichert,
  // nicht in der Wertung (Finger-Hinweis ist reine Visualisierung, ADR 0003).
  pure def accuracy(p: PlayerState): int = {
    val total = p.correct + p.errors
    if (total == 0) 100 else p.correct * 100 / total
  }

  pure def wpm(p: PlayerState, durationSec: int): int =
    if (durationSec <= 0) 0 else p.correct * 12 / durationSec

  // Start-Recht-Holder: Kopf der Join-Queue (frühester Joiner zuerst), -1 wenn leer.
  pure def startHolder(s: EngineState): int =
    if (s.joinQueue.length() == 0) -1 else s.joinQueue.nth(0)

  // Host-Flag für die UI: Der Host (erster Spieler) wird mit dem Suffix
  //  "(Host)" hinter seinem Namen angezeigt. Quint kann Strings nicht
  //  konkatenieren, daher liefert das Modell nur das Flag; die UI leitet
  //  daraus nickname + " (Host)" ab. Gespeichert wird nur der Nickname.
  pure def isHost(pid: int): bool = pid == HOST

  // ---- State variable ----
  var state: EngineState

  // ---- Invariants ----
  // Blockier-Semantik (ADR 0003): Cursor rückt nur bei korrekter Taste ->
  //  Cursor == Anzahl korrekter Tasten, immer.
  val cursorEqualsCorrect: bool =
    state.players.keys().forall(k => state.players.get(k).cursor == state.players.get(k).correct)

  val cursorBounded: bool =
    state.players.keys().forall(k => state.players.get(k).cursor <= state.roundText.length())

  val nonNegative: bool =
    state.players.keys().forall(k => and {
      state.players.get(k).cursor >= 0,
      state.players.get(k).correct >= 0,
      state.players.get(k).errors >= 0,
    })

  // Join-Queue ist eine Permutation der Spieler-Schlüssel (jeder genau einmal).
  val queueMatchesPlayers: bool = and {
    state.joinQueue.length() == state.players.keys().size(),
    state.players.keys().forall(k => state.joinQueue.select(q => q == k).length() == 1),
  }

  val startHolderValid: bool =
    startHolder(state) == -1 or startHolder(state).in(state.players.keys())

  val timeBounded: bool = and {
    state.timeRemaining >= 0,
    state.timeRemaining <= state.roundDuration,
  }

  val resultsTimeZero: bool =
    state.phase != Results or state.timeRemaining == 0

  // ---- Witnesses ----
  val reachedWaiting: bool = state.phase == WaitingForNewSession
  val reachedRound: bool = state.phase == Round
  val reachedResults: bool = state.phase == Results
  val someError: bool = state.players.keys().exists(k => state.players.get(k).errors > 0)
  val someFinished: bool =
    state.phase == Round and state.players.keys().exists(k => finished(state.players.get(k), state.roundText))
  val secondRound: bool = state.roundNumber >= 2
  val soloRound: bool = state.phase == Round and state.players.keys().size() == 1
  val rotation: bool =
    state.roundStarters.length() >= 2 and state.roundStarters.nth(0) != state.roundStarters.nth(1)
  // Indikatoren für leere Runden/Results (defensiv; ohne Host-Auto-Join selten,
  //  aber möglich, wenn alle während einer Runde verlassen):
  val emptyRound: bool = state.phase == Round and state.players.keys().size() == 0
  val emptyResults: bool = state.phase == Results and state.players.keys().size() == 0

  // ---- Actions ----
  // Beitritt ist nur OHNE laufendes Spiel möglich (Waiting/Lobby), nicht in
  //  Round/Results. Der Host ist nicht vorgegeben: Er ist der Erste, der
  //  beitritt, und durchläuft denselben Dialog wie alle anderen.
  pure def canJoin(s: EngineState, pid: int, nickname: str): bool = and {
    or { s.phase == WaitingForNewSession, s.phase == Lobby },
    not(pid.in(s.players.keys())),
    s.players.keys().size() < MAX_PLAYERS,
  }
  pure def applyJoin(s: EngineState, pid: int, nickname: str): EngineState = {
    val p = { nickname: nickname, cursor: 0, correct: 0, errors: 0 }
    {...s, players: s.players.put(pid, p), joinQueue: s.joinQueue.append(pid)}
  }
  action join(pid: int, nickname: str): bool = all {
    canJoin(state, pid, nickname),
    state' = applyJoin(state, pid, nickname),
  }

  // Neue Session starten: nur der Host, aus dem Warten heraus. Spieler und
  //  Queue bleiben erhalten (Carry-over); es wird nur die Phase gewechselt.
  pure def canStartSession(s: EngineState, pid: int): bool = and {
    s.phase == WaitingForNewSession,
    pid == HOST,
    HOST.in(s.players.keys()),
  }
  pure def applyStartSession(s: EngineState): EngineState = {...s, phase: Lobby}
  action startSession(pid: int): bool = all {
    canStartSession(state, pid),
    state' = applyStartSession(state),
  }

  // Dauer wählt nur der Host (Kaller-Check).
  pure def canSetDuration(s: EngineState, pid: int, d: int): bool = and {
    s.phase == Lobby,
    pid == HOST,
    d.in(DURATIONS),
  }
  pure def applySetDuration(s: EngineState, d: int): EngineState = {...s, roundDuration: d}
  action setDuration(pid: int, d: int): bool = all {
    canSetDuration(state, pid, d),
    state' = applySetDuration(state, d),
  }

  pure def canStartRound(s: EngineState, pid: int, text: List[str]): bool = and {
    s.phase == Lobby,
    s.players.keys().size() >= 1,
    pid == startHolder(s),
    text.in(TEXTS),
  }
  pure def applyStartRound(s: EngineState, pid: int, text: List[str]): EngineState = {
    val reset = s.players.keys().mapBy(k => {...s.players.get(k), cursor: 0, correct: 0, errors: 0})
    {...s,
      phase: Round,
      players: reset,
      timeRemaining: s.roundDuration,
      roundText: text,
      roundNumber: s.roundNumber + 1,
      roundStarters: s.roundStarters.append(pid),
    }
  }
  action startRound(pid: int, text: List[str]): bool = all {
    canStartRound(state, pid, text),
    state' = applyStartRound(state, pid, text),
  }

  pure def canTick(s: EngineState): bool = s.phase == Round and s.timeRemaining > 0
  pure def applyTick(s: EngineState): EngineState = {...s, timeRemaining: s.timeRemaining - 1}
  action tick = all {
    canTick(state),
    state' = applyTick(state),
  }

  pure def canRoundEnd(s: EngineState): bool = s.phase == Round and s.timeRemaining == 0
  pure def applyRoundEnd(s: EngineState): EngineState = {...s, phase: Results}
  action roundEnd = all {
    canRoundEnd(state),
    state' = applyRoundEnd(state),
  }

  pure def canKeystroke(s: EngineState, pid: int, key: str): bool = and {
    s.phase == Round,
    s.timeRemaining > 0,
    pid.in(s.players.keys()),
    s.roundText.length() > 0,
    not(finished(s.players.get(pid), s.roundText)),
  }
  pure def applyKeystroke(s: EngineState, pid: int, key: str): EngineState = {
    val p = s.players.get(pid)
    val p2 = if (key == s.roundText.nth(p.cursor)) {...p, cursor: p.cursor + 1, correct: p.correct + 1}
             else {...p, errors: p.errors + 1}
    {...s, players: s.players.set(pid, p2)}
  }
  action keystroke(pid: int, key: str): bool = all {
    canKeystroke(state, pid, key),
    state' = applyKeystroke(state, pid, key),
  }

  // Spieler verlässt: aus Spieler + Queue entfernen, Phase bleibt unverändert.
  pure def canDisconnect(s: EngineState, pid: int): bool = pid.in(s.players.keys())
  pure def applyDisconnect(s: EngineState, pid: int): EngineState = {
    val players2 = s.players.keys().filter(k => k != pid).mapBy(k => s.players.get(k))
    val queue2 = s.joinQueue.select(q => q != pid)
    {...s, players: players2, joinQueue: queue2}
  }
  action disconnect(pid: int): bool = all {
    canDisconnect(state, pid),
    state' = applyDisconnect(state, pid),
  }

  // Session beenden: nach den Results zurück ins Warten. Spieler und Queue
  //  bleiben erhalten (Carry-over); Start-Recht rotiert (Kopf -> Ende).
  pure def canEndSession(s: EngineState): bool = s.phase == Results
  pure def applyEndSession(s: EngineState): EngineState = {
    val q = s.joinQueue
    val q2 = if (q.length() == 0) q else q.tail().append(q.head())
    {...s, phase: WaitingForNewSession, timeRemaining: 0, joinQueue: q2}
  }
  action endSession = all {
    canEndSession(state),
    state' = applyEndSession(state),
  }

  // ---- Init ----
  // Kein vorgegebener Host: Das Spiel startet im Warten OHNE Spieler. Der
  //  Host ist der Erste, der beitritt (gleicher Dialog wie alle anderen).
  action init = state' = {
    phase: WaitingForNewSession,
    players: Map(),
    joinQueue: List(),
    roundDuration: DEFAULT_DURATION,
    timeRemaining: 0,
    roundText: List(),
    roundNumber: 0,
    roundStarters: List(),
  }

  // ---- Step ----
  action step = {
    nondet pid = PLAYERS.oneOf()
    nondet key = KEYS.oneOf()
    nondet text = TEXTS.oneOf()
    nondet dur = DURATIONS.oneOf()
    nondet nick = NICKNAMES.oneOf()
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
