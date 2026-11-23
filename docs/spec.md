# Spec: TYPE RUSH (MVP)

> Status: Entwurf. Triagie-Label `ready-for-agent` wird nach `/setup-matt-pocock-skills`
> beim Veröffentlichen im Issue-Tracker gesetzt.

## Problem Statement

Wer Blind-Tippen lernen will, braucht regelmäßiges, motivierendes Üben – aber klassische
Tipptrainer sind einsam und langweilig. Nutzer wollen im lokalen Netz (z. B. im Vortrag, im
Klassenzimmer, zu Hause) **mehrere Personen gleichzeitig gegeneinander antreten lassen**,
komfortabel **im Browser**, ohne Installation, Cloud oder Accounts. Sie wollen sehen, wer
schnell und wer korrekt tippt, und dabei die richtige Fingertechnik lernen.

## Solution

Ein lokales Multiplayer-Rennspiel: Ein Server-Process läuft auf einer Maschine im LAN
(z. B. dem Laptop des Vortragenden); alle Spieler verbinden sich per Browser über die
angezeigte URL. **Ohne Host und ohne manuellen Start:** Jeder, der die URL öffnet, tritt
als Zuschauer bei und kann sich für die nächste Runde anmelden (*Mitspielen*). Das Spiel
läuft im eigenen Takt: Die Lobby zählt 30 Sekunden herunter (sofern sich mindestens zwei
Spieler angemeldet haben; bei acht Spielern sofort), dann ein 3-Sekunden-Countdown, dann
die Runde mit fester Dauer. Alle tippen denselben deutschen Text; die höchste **Wertung**
(Tempo + Tasten-Genauigkeit) gewinnt. Die UI zeigt permanent, welcher **Finger** die
nächste Taste drücken soll (Lernhilfe, zählt nicht in die Wertung), hebt das nächste
Zeichen hervor und zeigt ein Live-Leaderboard plus eigene WPM/Genauigkeit. Falsche
Tasten blockieren (Monkeytype-Stil), was korrektes Tippen erzwingt. Nach den Ergebnissen
geht es automatisch zurück in die Lobby – das Spiel zirkuliert endlos.

## User Stories

1. As a presenter, I want to start the server on my machine with one command, so that I can run a game without any setup or cloud.
2. As a presenter, I want a URL (http://192.168.x.x:port) shown on my screen, so that other players can join by opening it.
3. As a player, I want to join the game by opening the URL in my browser, so that I need no installation or account.
4. As a player, I want to enter my own nickname when joining, so that I can be identified on the leaderboard.
5. As a player, I want to see all signed-up players and the spectators in the lobby, so that I know who I am racing against.
6. As a player, I want to sign up for the next round with a single button, so that I can join the race without coordinating with anyone.
7. As a player, I want the round to start automatically (30s lobby timer with 2+ players, immediately at 8 players, then a 3s countdown), so that nobody has to coordinate the start.
8. As a player, I want the game to cycle on its own (lobby → countdown → round → results → lobby), so that the game keeps running without any host.
9. As a player, I want to see the text to type in large characters, so that I can read it comfortably.
10. As a player, I want the next character to be highlighted, so that I always know where I am.
11. As a player, I want a finger diagram showing which finger to press for the next key, so that I learn correct technique.
12. As a player, I want my own WPM and accuracy displayed live, so that I can gauge my performance.
13. As a player, I want a live leaderboard showing every player's progress and Wertung, so that I can see who is ahead.
14. As a player, when I press the wrong key, I want the cursor to stay and the spot marked red, so that I am forced to correct it (learning signal).
15. As a player, I want each wrong keypress counted as an error in my accuracy, so that my Wertung reflects technique.
16. As a player, I want the round to last a fixed time (60s), so that everyone gets equal time and the highest Wertung wins.
17. As a player, I want the round text to be a random common German word/sentence, so that content is realistic and varied each round.
18. As a player, I want the text length calibrated to the round duration, so that a good typist finishes near the deadline (tension).
19. As a player, I want to see final results (ranking by Wertung) when the round ends, so that I know who won.
20. As a player, I want the game to return to the lobby after the results, where I can sign up again, so that we can keep competing without any manual restart.
21. As a player, when I disconnect, I want my seat handled gracefully (removed from the round/leaderboard), so that the game continues for others.
22. As a player, I want to play on a phone or laptop browser, so that I can join from whatever device I have.
23. As a player, I want visual (not audio) feedback for correct/incorrect keys, so that I get feedback without sound.

## Implementation Decisions

- **Stack:** TypeScript end-to-end. Server: Node.js + a WebSocket library. Frontend: TS SPA with vanilla DOM (no heavy framework). (Q5)
- **Authoritative server (ADR 0001):** The server receives every keystroke and computes all game state; the client renders. No client-side scoring. Consequence: the game lives on one machine; player count bound to that machine; no internet needed.
- **No host (rule, not description):** There is no host role. Every connection joins via the nickname dialog as a **spectator**; players opt in for the next round by signing up (up to 8). Nothing requires a "first" player — the game starts as soon as the lobby rules are met.
- **Auto-starting lifecycle:** `Lobby → Countdown → Round → Results → Lobby → …` (model: same). The lobby runs a 30s participation timer that only counts down while at least one player is signed up; it reloads to 30s when the roster becomes empty. The countdown starts when the timer hits 0 with 2+ players, or immediately when the roster is full (8). The round runs for a fixed 60s (or ends early when every player finished the text). The results are displayed for 10s, then the game returns to the lobby; all players become spectators again and must re-sign up.
- **Join rule:** Joining is allowed in ALL phases (unlimited spectators, no double-join). Signing up is only possible in the lobby (spectator → player, max 8).
- **Single test seam – the game engine:** All game rules live in one pure, deterministic, event-driven module (the engine) on the server. It is decoupled from the WebSocket transport and the frontend. The engine consumes a stream of events (join, signUp, keystroke, tick, disconnect) plus an injected clock and RNG, maintains per-player state (position, errors, WPM, accuracy, Wertung), and emits state snapshots (leaderboard, round phase, time remaining). The WebSocket layer and the browser SPA are thin adapters around it.
- **Round model (ADR 0002):** Fixed duration (60s). All players type the same text; highest Wertung wins. UI needs a timer, not finish-detection.
- **Wertung:** `score = accuracy² × (correct chars / duration) × 100`, integer arithmetic, 0 if no keypresses (i.e. `100·correct³ / (total²·durationSec)`). Rewards technique: slow+correct beats fast+inaccurate (60s example: 10 correct/0 errors → 16 beats 12 correct/6 errors → 8; even 3× volume at 50% accuracy → 12 loses to the clean+slow player).
- **Blocking errors (ADR 0003):** A wrong keypress does not advance the cursor; the spot is marked red; the correct key must be pressed to continue; every wrong press counts as an error.
- **Finger mapping:** A QWERTZ home-row finger map (key → finger) drives the Finger-Hinweis. Pure function, used by both the engine (for any server-side needs) and the frontend diagram. Not part of the Wertung.
- **Text source:** A curated, bundled list of common German words/sentences on QWERTZ; one is chosen at random per round; length calibrated to the round duration (~1–1.3 chars/sec): 60s → 60–80 chars.
- **Auto-start (replaces host + Start-Recht):** The lobby timer (30s) plus the 3s countdown fully replace the old host-driven start. No one can trigger or delay a start; the only player input is signing up.
- **Discovery:** The presenting machine displays the LAN URL on screen. No QR code.
- **No persistence:** No accounts, no saved highscores, no data written to disk beyond the bundled content.

## Testing Decisions

- **Good test = external behavior only.** Tests feed the engine a sequence of events (with a controlled clock) and assert on the emitted state snapshots and final results — never on internal implementation details.
- **Primary seam: the game engine.** It is the single highest seam. Because it is pure and deterministic (clock injected, not wall-clock), tests are fast and stable.
- **Engine behaviors covered by tests:** join (all phases, spectator); signUp (lobby only, roster rules, timer reload); auto-start cascade (lobby timer → countdown → round); round progression via injected clock; early round end when all players finished; blocking wrong-key handling (cursor stays, error counted); correct-key advancement; WPM/accuracy/Wertung computation; leaderboard ordering; results → lobby cycle; disconnect handling (roster, winner re-derivation, lobby timer reload); final ranking.
- **Pure helpers** (QWERTZ finger map, text-length calibration, WPM/accuracy formulas) may be unit-tested directly where non-trivial, but their *behavior* is verified through the engine seam.
- **Formal model (Quint):** The game rules are additionally specified in `quint/` and checked with `quint test` / `quint run` (invariants + reachability) as an independent verification of the engine's rule set.
- **Not tested separately:** the WebSocket transport and the browser SPA (thin I/O/presentation adapters). Frontend rendering is covered by the engine's emitted snapshots being correct.
- **Prior art:** none yet (empty repo) – the engine's test suite is the first; it establishes the pattern (pure function, injected clock, event-in / snapshot-out).

## Out of Scope

- Accounts and user persistence (no saved profiles, no highscore storage).
- Sound / haptic feedback (visual only in MVP).
- Multiple content packs (single curated German list only).
- Co-op / team modes (race only).
- A separate dedicated learning mode (learning is folded into the race via Finger-Hinweise).
- Cloud hosting, internet play, NAT traversal.
- QR-code joining (URL only).
- Mobile-native apps (browser only).
- Manual start control / host role (the game auto-starts; see Solution).

## Further Notes

- German-speaking users; UI text in German.
- Designed for 2–4 players, supports up to 8.
- There is no host: the presenting machine runs the server, every browser is a spectator that can sign up.
- Finger correctness is intentionally NOT scored — a standard keyboard reports the key, not the finger (unmeasurable). The Finger-Hinweis is a pure visual learning aid.
