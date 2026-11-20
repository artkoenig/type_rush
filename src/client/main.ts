import type { Snapshot } from "../engine/engine.js";
import type { Duration } from "../content/textPool.js";
import {
  renderDisconnected,
  renderWaiting,
  renderLobby,
  renderResults,
  renderRound,
  type Actions,
} from "./views.js";
import { el } from "./dom.js";
import { showNicknamePrompt } from "./nickname.js";

function requireApp(): HTMLElement {
  const app = document.getElementById("app");
  if (!app) throw new Error("app element fehlt");
  return app;
}

const app = requireApp();

let myId: string | null = null;
let joined = false;
let lastSnapshot: Snapshot | null = null;
let cursorAtKeystroke: number | null = null;

const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);

const actions: Actions = {
  startSession: () => send({ type: "startSession" }),
  start: () => send({ type: "start" }),
  setDuration: (duration: Duration) => send({ type: "setDuration", duration }),
  endSession: () => send({ type: "endSession" }),
};

function send(message: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

ws.onmessage = (event: MessageEvent) => {
  let data: unknown;
  try {
    data = JSON.parse(event.data as string);
  } catch {
    return;
  }
  if (typeof data !== "object" || data === null) return;
  const obj = data as { type?: unknown; playerId?: unknown; phase?: unknown };
  if (obj.type === "hello") {
    myId = typeof obj.playerId === "string" ? obj.playerId : null;
    // Everyone (including the first player / host) enters a name via the same dialog.
    showNicknamePrompt((nickname) => {
      send({ type: "join", nickname });
      joined = true;
    });
    return;
  }
  if (typeof obj.phase === "string") {
    handleSnapshot(data as Snapshot);
  }
};

ws.onclose = () => {
  renderDisconnected(app);
};

function handleSnapshot(snap: Snapshot): void {
  lastSnapshot = snap;
  const me = snap.players.find((p) => p.id === myId);
  const meSpectator = snap.spectators.find((s) => s.id === myId);
  let error = false;
  if (cursorAtKeystroke !== null && me !== undefined) {
    error = me.cursor === cursorAtKeystroke;
    cursorAtKeystroke = null;
  }
  switch (snap.phase) {
    case "waiting":
      renderWaiting(app, snap, myId, actions);
      break;
    case "lobby":
      renderLobby(app, snap, myId, actions);
      break;
    case "round": {
      if (meSpectator !== undefined && me === undefined) {
        // Spectator view: show leaderboard but no typing UI
        renderRound(app, snap, myId, false, 0);
      } else {
        renderRound(app, snap, myId, error, me?.typingElapsed ?? 0);
      }
      break;
    }
    case "results":
      renderResults(app, snap, myId, actions);
      break;
  }
}

document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (!joined || ws.readyState !== WebSocket.OPEN) return;
  if (lastSnapshot?.phase !== "round") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length !== 1) return;
  if (e.key === " ") e.preventDefault();
  const me = lastSnapshot.players.find((p) => p.id === myId);
  if (me === undefined) return; // spectator: no typing
  if (me.cursor >= lastSnapshot.text.length) return; // text finished
  cursorAtKeystroke = me.cursor;
  send({ type: "keystroke", key: e.key });
});

app.append(el("p", { class: "waiting" }, "Verbinde…"));
