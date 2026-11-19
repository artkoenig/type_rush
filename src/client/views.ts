import type { Snapshot } from "../engine/engine.js";
import { DURATIONS, type Duration } from "../content/textPool.js";
import { el } from "./dom.js";
import { fingerLabel, renderKeyboard } from "./keyboard.js";
import { fingerFor } from "../engine/fingerMap.js";

export interface Actions {
  startSession(): void;
  start(): void;
  setDuration(duration: Duration): void;
  endSession(): void;
}

function playerList(snap: Snapshot, myId: string | null): HTMLElement {
  return el(
    "ul",
    { class: "players" },
    ...snap.players.map((p) =>
      el(
        "li",
        { class: p.id === myId ? "me" : "" },
        `${p.nickname}${p.isHost ? " (Host)" : ""}${p.id === myId ? " (du)" : ""}`,
      ),
    ),
  );
}

export function renderWaiting(
  app: HTMLElement,
  snap: Snapshot,
  myId: string | null,
  actions: Actions,
): void {
  const isHost = snap.players.find((p) => p.isHost)?.id === myId;
  const controls = el(
    "div",
    { class: "controls" },
    isHost
      ? el(
          "button",
          { class: "btn primary", on: { click: () => actions.startSession() } },
          "Session starten",
        )
      : el("p", { class: "waiting" }, "Warte auf den Host…"),
  );
  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    el("h2", {}, "Warten auf neue Session"),
    playerList(snap, myId),
    controls,
  );
}

export function renderLobby(
  app: HTMLElement,
  snap: Snapshot,
  myId: string | null,
  actions: Actions,
): void {
  const isHost = snap.players.find((p) => p.isHost)?.id === myId;
  const holdsStart = snap.startRight === myId;

  const controls = el(
    "div",
    { class: "controls" },
    isHost
      ? el(
          "div",
          { class: "durations" },
          ...DURATIONS.map((d) =>
            el(
              "button",
              {
                class: `btn${snap.duration === d ? " active" : ""}`,
                on: { click: () => actions.setDuration(d) },
              },
              `${d} s`,
            ),
          ),
        )
      : el("span"),
    holdsStart
      ? el("button", { class: "btn primary", on: { click: () => actions.start() } }, "Start")
      : el("p", { class: "waiting" }, "Warte auf Start…"),
  );

  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    el("h2", {}, "Lobby"),
    playerList(snap, myId),
    controls,
  );
}

export function renderRound(
  app: HTMLElement,
  snap: Snapshot,
  myId: string | null,
  error: boolean,
  elapsed: number,
): void {
  const me = snap.players.find((p) => p.id === myId);
  const cursor = me?.cursor ?? 0;
  const nextKey = cursor < snap.text.length ? snap.text[cursor] : null;

  const chars = el(
    "div",
    { class: "text" },
    ...Array.from(snap.text).map((ch, i) => {
      let cls = "char";
      if (i < cursor) cls += " typed";
      else if (i === cursor) cls += error ? " error" : " next";
      return el("span", { class: cls }, ch);
    }),
  );

  const keyboard = el("div", { class: "keyboard" });
  renderKeyboard(keyboard, nextKey);
  const hint = el("p", { class: "hint" }, nextKey ? fingerLabel(fingerFor(nextKey)) : "Fertig!");

  const wpm = me && elapsed > 0 ? Math.round(me.correct / 5 / (elapsed / 60)) : 0;
  const accuracy = me && me.total > 0 ? Math.round((me.correct / me.total) * 100) : 100;
  const stats = el(
    "div",
    { class: "stats" },
    el(
      "div",
      { class: "stat" },
      el("span", { class: "stat-value" }, String(wpm)),
      el("span", { class: "stat-label" }, " WPM"),
    ),
    el(
      "div",
      { class: "stat" },
      el("span", { class: "stat-value" }, `${accuracy}%`),
      el("span", { class: "stat-label" }, " Trefferquote"),
    ),
  );

  const board = el(
    "ol",
    { class: "board" },
    ...snap.players.map((p, i) =>
      el(
        "li",
        { class: p.id === myId ? "me" : "" },
        el("span", { class: "rank" }, `${i + 1}.`),
        el("span", { class: "nick" }, p.nickname),
        el("span", { class: "wertung" }, String(p.wertung)),
      ),
    ),
  );

  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    el("div", { class: "timer" }, formatTime(snap.timeRemaining)),
    chars,
    keyboard,
    hint,
    el(
      "div",
      { class: "bottom" },
      stats,
      el("div", { class: "board-wrap" }, el("h3", {}, "Rangliste"), board),
    ),
  );
}

export function renderResults(
  app: HTMLElement,
  snap: Snapshot,
  myId: string | null,
  actions: Actions,
): void {
  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    el("h2", {}, "Ergebnis"),
    ranking(snap, myId),
    el(
      "button",
      { class: "btn primary", on: { click: () => actions.endSession() } },
      "Neue Session",
    ),
  );
}

function ranking(snap: Snapshot, myId: string | null): HTMLElement {
  return el(
    "ol",
    { class: "board" },
    ...snap.players.map((p, i) =>
      el(
        "li",
        { class: [p.id === snap.winnerId ? "winner" : "", p.id === myId ? "me" : ""].join(" ") },
        el("span", { class: "rank" }, `${i + 1}.`),
        el("span", { class: "nick" }, p.nickname),
        el("span", { class: "wertung" }, `${p.wertung} Wertung`),
      ),
    ),
  );
}

export function renderDisconnected(app: HTMLElement): void {
  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    el("p", { class: "disconnected" }, "Verbindung getrennt"),
    el("button", { class: "btn primary", on: { click: () => location.reload() } }, "Neu laden"),
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
