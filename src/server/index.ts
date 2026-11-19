import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { WebSocketServer, type RawData } from "ws";
import { GameServer, type ClientConnection } from "./server.js";

const PORT = Number(process.env.PORT ?? 3000);
const TICK_INTERVAL_MS = 1000;

const game = new GameServer();

const indexHtml = readFileSync(fileURLToPath(new URL("../client/index.html", import.meta.url)));
const appJs = buildSync({
  entryPoints: [fileURLToPath(new URL("../client/main.ts", import.meta.url))],
  bundle: true,
  write: false,
  format: "iife",
}).outputFiles[0].text;

const httpServer = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(indexHtml);
    return;
  }
  if (req.url === "/app.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(appJs);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found\n");
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const conn: ClientConnection = {
    id: crypto.randomUUID(),
    send: (data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    },
  };
  game.connect(conn);
  ws.on("message", (data) => game.message(conn, rawDataToString(data)));
  ws.on("close", () => game.disconnect(conn));
});

httpServer.listen(PORT, () => {
  console.log(`blind-typing-multiplayer: open http://${lanIp()}:${PORT} in your browser`);
});

setInterval(() => game.tick(), TICK_INTERVAL_MS);

/** First non-internal IPv4 address, i.e. the LAN address. */
function lanIp(): string {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

function rawDataToString(data: RawData): string {
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return data.toString("utf8");
}
