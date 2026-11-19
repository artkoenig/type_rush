import type { Snapshot } from "../engine/engine.js";
import type { Duration } from "../content/textPool.js";
import {
  renderDisconnected,
  renderGameOver,
  renderLobby,
  renderResults,
  renderRound,
  type Actions,
} from "./views.js";
import { el } from "./dom.js";

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
/** Elapsed seconds frozen when the player finished the text, so the WPM stops counting. */
let finishedElapsed: number | null = null;

const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);

const actions: Actions = {
  start: () => send({ type: "start" }),
  setDuration: (duration: Duration) => send({ type: "setDuration", duration }),
  backToLobby: () => send({ type: "backToLobby" }),
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
  const obj = data as { type?: unknown; playerId?: unknown; isHost?: unknown; phase?: unknown };
  if (obj.type === "hello") {
    myId = typeof obj.playerId === "string" ? obj.playerId : null;
    if (obj.isHost === true) {
      joined = true;
    } else {
      promptNickname();
    }
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
  let error = false;
  if (cursorAtKeystroke !== null && me !== undefined) {
    error = me.cursor === cursorAtKeystroke;
    cursorAtKeystroke = null;
  }
  switch (snap.phase) {
    case "lobby":
      renderLobby(app, snap, myId, actions);
      break;
    case "round": {
      if (me !== undefined) {
        if (me.cursor >= snap.text.length) {
          if (finishedElapsed === null) finishedElapsed = snap.duration - snap.timeRemaining;
        } else {
          finishedElapsed = null; // new round, counting starts again
        }
      }
      renderRound(app, snap, myId, error, finishedElapsed ?? snap.duration - snap.timeRemaining);
      break;
    }
    case "results":
      renderResults(app, snap, myId, actions);
      break;
    case "gameover":
      renderGameOver(app, snap, myId);
      break;
  }
}

/** Overlay asking for a nickname; every non-host must join before playing. */
function promptNickname(): void {
  const overlay = document.createElement("div");
  overlay.className = "overlay";

  const input = document.createElement("input");
  input.className = "nickname";
  input.maxLength = 20;
  input.placeholder = "Dein Name";

  const submit = () => {
    send({ type: "join", nickname: input.value.trim() || "Spieler" });
    joined = true;
    overlay.remove();
  };

  const button = document.createElement("button");
  button.className = "btn primary";
  button.textContent = "Los geht's";
  button.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  const row = document.createElement("div");
  row.className = "row";
  row.append(input, button);

  const box = document.createElement("div");
  box.className = "overlay-box";
  box.append(el("h1", {}, "Blind-Tippen"), el("p", {}, "Wie sollen wir dich nennen?"), row);

  overlay.append(box);
  app.append(overlay);
  input.focus();
}

document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (!joined || ws.readyState !== WebSocket.OPEN) return;
  if (lastSnapshot?.phase !== "round") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length !== 1) return;
  if (e.key === " ") e.preventDefault();
  const me = lastSnapshot.players.find((p) => p.id === myId);
  if (me !== undefined && me.cursor >= lastSnapshot.text.length) return; // text finished
  cursorAtKeystroke = me?.cursor ?? null;
  send({ type: "keystroke", key: e.key });
});

app.append(el("p", { class: "waiting" }, "Verbinde…"));
