# Spec: Blind-Tippen Multiplayer (MVP)

> Status: Entwurf. Triagie-Label `ready-for-agent` wird nach `/setup-matt-pocock-skills`
> beim Veröffentlichen im Issue-Tracker gesetzt.

## Problem Statement

Wer Blind-Tippen lernen will, braucht regelmäßiges, motivierendes Üben – aber klassische
Tipptrainer sind einsam und langweilig. Nutzer wollen im lokalen Netz (z. B. im Vortrag, im
Klassenzimmer, zu Hause) **mehrere Personen gleichzeitig gegeneinander antreten lassen**,
komfortabel **im Browser**, ohne Installation, Cloud oder Accounts. Sie wollen sehen, wer
schnell und wer korrekt tippt, und dabei die richtige Fingertechnik lernen.

## Solution

Ein lokales Multiplayer-Rennspiel: Ein Host betreibt einen Server im LAN; alle Spieler
(inkl. Host) verbinden sich per Browser über die angezeigte URL. In einer Runde mit fester
Dauer tippen alle denselben deutschen Text; die höchste **Wertung** (Tempo +
Tasten-Genauigkeit) gewinnt. Die UI zeigt permanent, welcher **Finger** die nächste Taste
drücken soll (Lernhilfe, zählt nicht in die Wertung), hebt das nächste Zeichen hervor und
zeigt ein Live-Leaderboard plus eigene WPM/Genauigkeit. Falsche Tasten blockieren
(Monkeytype-Stil), was korrektes Tippen erzwingt.

## User Stories

1. As a Host, I want to start a server on my machine with one command, so that I can run a game without any setup or cloud.
2. As a Host, I want a URL (http://192.168.x.x:port) shown on my screen, so that other players can join by opening it.
3. As a player, I want to join the game by opening the URL in my browser, so that I need no installation or account.
4. As a player, I want to enter a nickname when joining, so that I can be identified on the leaderboard.
5. As a Host, I want to see all joined players and their nicknames in the Lobby, so that I know who is ready.
6. As a player, I want to see the other players in the Lobby, so that I know who I am racing against.
7. As a player, I want the round to start when the player holding the Start-Recht triggers it (no countdown), so that we can begin on our own timing.
8. As a player, I want the Start-Recht to rotate among players (earliest joiner first, then next), so that starting is fair and shared.
9. As a player, I want to be able to start a round even alone (solo practice), so that I can practice without waiting for others.
10. As a player, I want to see the text to type in large characters, so that I can read it comfortably.
11. As a player, I want the next character to be highlighted, so that I always know where I am.
12. As a player, I want a finger diagram showing which finger to press for the next key, so that I learn correct technique.
13. As a player, I want my own WPM and accuracy displayed live, so that I can gauge my performance.
14. As a player, I want a live leaderboard showing every player's progress and Wertung, so that I can see who is ahead.
15. As a player, when I press the wrong key, I want the cursor to stay and the spot marked red, so that I am forced to correct it (learning signal).
16. As a player, I want each wrong keypress counted as an error in my accuracy, so that my Wertung reflects technique.
17. As a player, I want the round to last a fixed time (60s default), so that everyone gets equal time and the highest Wertung wins.
18. As a Host, I want to choose the round duration (30/60/120s) in the Lobby, so that I can adapt to the audience.
19. As a player, I want the round text to be a random common German word/sentence, so that content is realistic and varied each round.
20. As a player, I want the text length calibrated to the round duration, so that a good typist finishes near the deadline (tension).
21. As a player, I want to see final results (ranking by Wertung) when the round ends, so that I know who won.
22. As a player, I want to be able to play another round after a round ends, so that we can keep competing.
23. As a player, when I disconnect, I want my seat handled gracefully (removed from the round/leaderboard), so that the game continues for others.
24. As a Host, if I (the host) leave, I accept the game ends for everyone, so that the authoritative model stays simple.
25. As a player, I want to play on a phone or laptop browser, so that I can join from whatever device I have.
26. As a player, I want visual (not audio) feedback for correct/incorrect keys, so that I get feedback without sound.

## Implementation Decisions

- **Stack:** TypeScript end-to-end. Server: Node.js + a WebSocket library. Frontend: TS SPA with vanilla DOM (no heavy framework). (Q5)
- **Authoritative server (ADR 0001):** The server receives every keystroke and computes all game state; the client renders. No client-side scoring. Consequence: host must stay; player count bound to host machine; no internet needed.
- **Single test seam – the game engine:** All game rules live in one pure, deterministic, event-driven module (the engine) on the server. It is decoupled from the WebSocket transport and the frontend. The engine consumes a stream of events (join, start, keystroke, disconnect) plus round config, maintains per-player state (position, errors, WPM, accuracy, Wertung), and emits state snapshots (leaderboard, round phase, time remaining). The WebSocket layer and the browser SPA are thin adapters around it.
- **Round model (ADR 0002):** Fixed duration (60s default; host-selectable 30/60/120s). All players type the same text; highest Wertung wins. UI needs a timer, not finish-detection.
- **Wertung:** A per-player number combining Tempo (e.g. WPM of correctly typed characters) and Tasten-Genauigkeit (correct / total keypresses). Exact formula to be finalized in tickets; must reward technique (slow+correct can beat fast+inaccurate).
- **Blocking errors (ADR 0003):** A wrong keypress does not advance the cursor; the spot is marked red; the correct key must be pressed to continue; every wrong press counts as an error.
- **Finger mapping:** A QWERTZ home-row finger map (key → finger) drives the Finger-Hinweis. Pure function, used by both the engine (for any server-side needs) and the frontend diagram. Not part of the Wertung.
- **Text source:** A curated, bundled list of common German words/sentences on QWERTZ; one is chosen at random per round; length calibrated to the round duration (~60–80 chars for 60s).
- **Start-Recht rotation:** Earliest joiner holds the first Start-Recht; it rotates to the next player after each round. No countdown. A round may start with 1+ players.
- **Discovery:** Host displays the LAN URL on screen. No QR code.
- **No persistence:** No accounts, no saved highscores, no data written to disk beyond the bundled content.

## Testing Decisions

- **Good test = external behavior only.** Tests feed the engine a sequence of events (with a controlled clock) and assert on the emitted state snapshots and final results — never on internal implementation details.
- **Primary seam: the game engine.** It is the single highest seam. Because it is pure and deterministic (clock injected, not wall-clock), tests are fast and stable.
- **Engine behaviors covered by tests:** join/nickname; Start-Recht rotation and solo start; round start with no countdown; fixed-time progression via injected clock; blocking wrong-key handling (cursor stays, error counted); correct-key advancement; WPM/accuracy/Wertung computation; leaderboard ordering; disconnect handling; host-leave ends game; final ranking.
- **Pure helpers** (QWERTZ finger map, text-length calibration, WPM/accuracy formulas) may be unit-tested directly where non-trivial, but their *behavior* is verified through the engine seam.
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

## Further Notes

- German-speaking users; UI text in German.
- Designed for 2–4 players, supports up to 8.
- The host is also a player (connects via browser like everyone else).
- Finger correctness is intentionally NOT scored — a standard keyboard reports the key, not the finger (unmeasurable). The Finger-Hinweis is a pure visual learning aid.
