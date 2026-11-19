# 05: WebSocket-Server

**What to build:** A Node.js WebSocket server that hosts the game in the LAN. On startup it displays the LAN URL (http://192.168.x.x:port) on the console. It accepts browser connections, routes incoming events (join, start, keystroke, tick, disconnect) to the game engine, and broadcasts engine state snapshots to all connected clients. At round start it selects a text from the German text pool (ticket 02) calibrated to the current duration and includes it in the start event. The host's own browser session is the first connection and auto-joins as "Host".

**Blocked by:** 02 (Deutscher Text-Pool), 04 (Game Engine)

**Status:** done

- [x] `npm start` (or equivalent) launches the server and prints the LAN URL to the console
- [x] WebSocket connections are accepted; each connection maps to one player session
- [x] Client events (join, start, keystroke, disconnect) are parsed and forwarded to the engine
- [x] Engine snapshots are broadcast to all connected clients as JSON
- [x] On round start, a text is selected from the content pool (calibrated to duration) and included in the start event sent to the engine
- [x] A tick interval (1s) drives the engine clock
- [x] Host connection (first/identified) auto-joins with nickname "Host"
- [x] Host disconnect triggers GameOver broadcast to all remaining clients

## Umsetzung

- `src/server/server.ts` (neu): transport-agnostische `GameServer`-Klasse über der
  minimalen `ClientConnection`-Schnittstelle `{ id, send }` — testbar mit Fake-
  Connections, ohne echte Sockets. Brückt WS-Nachrichten zu Engine-Events und
  broadcastet Snapshots als JSON.
- **Erste Connection = Host:** erzeugt das Spiel (`createGame`) und auto-join als
  "Host"; spätere Connections erhalten nur den aktuellen Snapshot.
- **Wire-Protokoll:** `{type:"join",nickname}` | `{type:"start"}` |
  `{type:"keystroke",key}` | `{type:"setDuration",duration}` | `{type:"backToLobby"}`.
  Validierung an der Grenze (String-Checks, `DURATIONS.includes`); ungültige
  Nachrichten werden ignoriert. Der Server leitet `playerId` aus der Connection ab.
- **Rundenstart:** der Server selbst wählt per `calibrateText(state.duration, rng)`
  den Text aus dem Pool (kalibriert auf die Dauer) — der Client liefert nie Text.
- **Host-Disconnect:** Server entfernt die Connection, leitet das Engine-Event
  weiter; der Engine-GameOver wird an alle verbliebenen Clients broadcastet.
- Injizierbare `clock` (Default `Date.now()/1000` — Engine-Clock in Sekunden) und
  `rng` (Default `Math.random`).
- `src/server/index.ts` (neu): `node:http` + `ws` (`WebSocketServer`), pro Socket
  eine `ClientConnection` mit `crypto.randomUUID()`, 1s-`setInterval` für
  `game.tick()`, druckt beim Start die LAN-URL (`os.networkInterfaces()`,
  erstes internes IPv4, sonst 127.0.0.1). `PORT` via Umgebungsvariable, Default 3000.
- `src/engine/engine.ts`: `toSnapshot` exportiert (eine Zeile), damit der Server
  State ohne Duplizierung der Leaderboard-Logik serialisieren kann.
- `package.json`: `ws` (Dependency) + `@types/ws` (devDependency).
- `src/server/server.test.ts` (neu): 18 Tests mit Fake-Connections und injizierter
  Clock — Host-Connection, Join, Start (Text aus Pool, Start-Recht), Keystroke,
  Tick/Timer, Disconnect (Host → GameOver; Nicht-Host; nie verbunden),
  setDuration, backToLobby, Broadcast-Parität.
- Gate-Status: typecheck ✓, lint ✓, prettier ✓, 83 Tests ✓ (4 Dateien),
  CRAP-Gate exit 0.
