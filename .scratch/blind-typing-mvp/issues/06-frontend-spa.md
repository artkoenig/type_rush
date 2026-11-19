# 06: Frontend-SPA

**What to build:** A browser-based single-page application (vanilla TypeScript + DOM, no framework) that connects to the WebSocket server and renders the full game experience across three views: Lobby, Round, and Results. The UI is in German. It works on phone and laptop browsers (responsive). All feedback is visual (no audio).

**Blocked by:** 03 (Finger-Mapping), 05 (WebSocket-Server)

**Status:** ready-for-agent

- [ ] **Connection:** opens WebSocket to the server URL; on connect, prompts for nickname (if not host) and sends join event
- [ ] **Lobby view:** shows all joined players with nicknames; host sees a duration selector (30/60/120s) and a Start button; non-holder players see "Warte auf Start…"; the Start-Recht holder sees the Start button
- [ ] **Round view – text:** displays the round text in large characters; the next expected character is highlighted; typed characters are visually distinguished (e.g. dimmed); the current cursor position is clear
- [ ] **Round view – finger hint:** a keyboard diagram shows which finger to press for the next key (using the finger mapping from ticket 03); updates as the player progresses
- [ ] **Round view – stats:** player's own WPM and accuracy displayed live, updating with each keystroke
- [ ] **Round view – leaderboard:** live list of all players ordered by Wertung, updating in real-time
- [ ] **Round view – timer:** countdown of remaining time, prominently displayed
- [ ] **Round view – error feedback (ADR 0003):** wrong keypress marks the spot red; cursor does not advance; correct key must be pressed to continue
- [ ] **Results view:** final ranking by Wertung (all players); a "Nochmal spielen" button that returns to lobby
- [ ] **Disconnect handling:** if the connection drops, show a clear message; if GameOver received, show final state
- [ ] Responsive layout: usable on a phone screen (portrait) and a laptop browser
