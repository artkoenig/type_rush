# 06: Frontend-SPA

**What to build:** A browser-based single-page application (vanilla TypeScript + DOM, no framework) that connects to the WebSocket server and renders the full game experience across three views: Lobby, Round, and Results. The UI is in German. It works on phone and laptop browsers (responsive). All feedback is visual (no audio).

**Blocked by:** 03 (Finger-Mapping), 05 (WebSocket-Server)

**Status:** done

- [x] **Connection:** opens WebSocket to the server URL; on connect, prompts for nickname (if not host) and sends join event
- [x] **Lobby view:** shows all joined players with nicknames; host sees a duration selector (30/60/120s) and a Start button; non-holder players see "Warte auf Start…"; the Start-Recht holder sees the Start button
- [x] **Round view – text:** displays the round text in large characters; the next expected character is highlighted; typed characters are visually distinguished (e.g. dimmed); the current cursor position is clear
- [x] **Round view – finger hint:** a keyboard diagram shows which finger to press for the next key (using the finger mapping from ticket 03); updates as the player progresses
- [x] **Round view – stats:** player's own WPM and accuracy displayed live, updating with each keystroke
- [x] **Round view – leaderboard:** live list of all players ordered by Wertung, updating in real-time
- [x] **Round view – timer:** countdown of remaining time, prominently displayed
- [x] **Round view – error feedback (ADR 0003):** wrong keypress marks the spot red; cursor does not advance; correct key must be pressed to continue
- [x] **Results view:** final ranking by Wertung (all players); a "Nochmal spielen" button that returns to lobby
- [x] **Disconnect handling:** if the connection drops, show a clear message; if GameOver received, show final state
- [x] Responsive layout: usable on a phone screen (portrait) and a laptop browser

## Umsetzung

- `src/client/index.html` (neu): deutsche SPA-Seite mit inline-CSS (responsiv,
  mobiltauglich), `<div id="app">` als Render-Ziel, lädt `/app.js`.
- `src/client/dom.ts` (neu): kleine `el()`-Hilfe zum Aufbauen von DOM-Bäumen
  (Tag, Class, Text, Event-Handler, Kinder) — Vanilla-DOM ohne Framework.
- `src/client/keyboard.ts` (neu): QWERTZ-Tastaturlayout (3 Reihen + Leertaste)
  als DOM; `renderKeyboard` hebt die nächste Taste stark und die Tasten des
  selben Fingers weich hervor (Finger-Mapping aus Ticket 03).
- `src/client/views.ts` (neu): die vier Ansichten — `renderLobby` (Spielerliste,
  Dauer-Auswahl + Start-Button nur für Start-Rechts-Inhaber, sonst
  "Warte auf Start…"), `renderRound` (Timer mm:ss, Text mit getippt/nächste/
  falsch, Tastatur + Finger-Hinweis, WPM/Genauigkeit, Leaderboard nach
  Wertung), `renderResults` (Endrangliste, Gewinner 🏆, "Nochmal spielen"),
  `renderDisconnected` (Trennungsmeldung + Reload-Button).
- `src/client/main.ts` (neu): WebSocket zu `ws(s)://location.host`; auf `hello`
  wird die eigene Player-ID gesetzt, der Host startet direkt, alle anderen
  sehen ein Nickname-Overlay (Enter/„Los geht's", Fallback "Spieler");
  Keydown-Handler (nur in der Runde, keine Modifikatoren, `e.key.length===1`,
  Space via `preventDefault`) sendet `{type:"keystroke"}`; Fehler-Feedback
  (ADR 0003): rot markiert, wenn der Cursor im Snapshot nicht vorrückt;
  `ws.onclose` → Trennungs-Ansicht.
- `src/server/server.ts`: `connect` sendet vor dem Snapshot ein
  `{"type":"hello","playerId","isHost"}` an jede neue Connection — der Client
  kennt so ohne extra Handshake seine ID und Host-Rolle.
- `src/server/index.ts` (umgebaut): serviert neben dem WS auch die SPA —
  `GET /` liefert `src/client/index.html`, `GET /app.js` das per esbuild
  gebündelte `src/client/main.ts` (`buildSync`, IIFE, `write:false` beim
  Start). **Bugfix:** `lanIp()` prüft jetzt `!iface.internal` (vorher
  `iface.internal` — das druckte die Loopback- statt der LAN-Adresse,
  widersprach dem eigenen Kommentar).
- `package.json`: `esbuild` (devDependency) für das Client-Bundling.
- Tests: `src/server/server.test.ts` — 19 Tests (neuer Test: jede neue
  Connection erhält ein Hello mit korrektem `isHost`); die
  Sendezahlen-Ansprüche um je ein Hello angepasst. Client-Dateien sind
  bewusst ohne Unit-Tests (Testing Decisions: Browser-SPA wird nicht
  separat getestet).
- Gate-Status: typecheck ✓, lint ✓, prettier ✓, 84 Tests ✓, CRAP-Gate exit 0.
