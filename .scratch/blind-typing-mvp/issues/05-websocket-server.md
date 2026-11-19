# 05: WebSocket-Server

**What to build:** A Node.js WebSocket server that hosts the game in the LAN. On startup it displays the LAN URL (http://192.168.x.x:port) on the console. It accepts browser connections, routes incoming events (join, start, keystroke, tick, disconnect) to the game engine, and broadcasts engine state snapshots to all connected clients. At round start it selects a text from the German text pool (ticket 02) calibrated to the current duration and includes it in the start event. The host's own browser session is the first connection and auto-joins as "Host".

**Blocked by:** 02 (Deutscher Text-Pool), 04 (Game Engine)

**Status:** ready-for-agent

- [ ] `npm start` (or equivalent) launches the server and prints the LAN URL to the console
- [ ] WebSocket connections are accepted; each connection maps to one player session
- [ ] Client events (join, start, keystroke, disconnect) are parsed and forwarded to the engine
- [ ] Engine snapshots are broadcast to all connected clients as JSON
- [ ] On round start, a text is selected from the content pool (calibrated to duration) and included in the start event sent to the engine
- [ ] A tick interval (1s) drives the engine clock
- [ ] Host connection (first/identified) auto-joins with nickname "Host"
- [ ] Host disconnect triggers GameOver broadcast to all remaining clients
