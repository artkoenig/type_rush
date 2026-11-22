import type { PlayerSnapshot, Snapshot } from "../engine/engine.js";
import { el } from "./dom.js";
import { fingerLabel, renderKeyboard } from "./keyboard.js";
import { fingerFor } from "../engine/fingerMap.js";

export interface Actions {
  signUp(): void;
}

function setCentered(app: HTMLElement, centered: boolean): void {
  app.classList.toggle("centered", centered);
}

function playerList(snap: Snapshot, myId: string | null): HTMLElement {
  if (snap.players.length === 0) return el("span");
  return el(
    "ul",
    { class: "players" },
    ...snap.players.map((p) =>
      el(
        "li",
        { class: p.id === myId ? "me" : "" },
        `${p.nickname}${p.id === myId ? " (du)" : ""}`,
      ),
    ),
  );
}

function spectatorList(snap: Snapshot, myId: string | null): HTMLElement | DocumentFragment {
  if (snap.spectators.length === 0) return document.createDocumentFragment();
  return el(
    "div",
    { class: "spectators" },
    el("h3", {}, "Zuschauer"),
    el(
      "ul",
      { class: "spectators-list" },
      ...snap.spectators.map((s) =>
        el(
          "li",
          { class: s.id === myId ? "me" : "" },
          `${s.nickname}${s.id === myId ? " (du)" : ""}`,
        ),
      ),
    ),
  );
}

/**
 * Lobby: the roster, the spectators, the 30s participation timer, and — once a
 * round has ended — the highscore table of the last round (the "results" view).
 * Spectators can sign up for the next round; the game auto-starts, nobody presses Start.
 */
export function renderLobby(
  app: HTMLElement,
  snap: Snapshot,
  myId: string | null,
  actions: Actions,
): void {
  setCentered(app, true);
  const isPlayer = snap.players.some((p) => p.id === myId);
  const controls = el(
    "div",
    { class: "controls" },
    isPlayer
      ? el("p", { class: "waiting" }, "Warte auf Start…")
      : el("button", { class: "btn primary", on: { click: () => actions.signUp() } }, "Mitspielen"),
  );
  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    el("h2", {}, "Lobby"),
    el("div", { class: "timer" }, formatTime(snap.timeRemaining)),
    playerList(snap, myId),
    spectatorList(snap, myId),
    controls,
    ...(snap.lastRoundResults.length > 0
      ? [
          el(
            "div",
            { class: "board-wrap" },
            el("h3", {}, "Letzte Runde"),
            ranking(snap.lastRoundResults, myId, snap.winnerId),
          ),
        ]
      : []),
  );
}

/** Countdown: a big number, then the round starts automatically. */
export function renderCountdown(app: HTMLElement, snap: Snapshot, myId: string | null): void {
  setCentered(app, true);
  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    el("h2", {}, "Los in…"),
    el("div", { class: "timer" }, String(snap.timeRemaining)),
    playerList(snap, myId),
    spectatorList(snap, myId),
  );
}

export function renderRound(
  app: HTMLElement,
  snap: Snapshot,
  myId: string | null,
  error: boolean,
  elapsed: number,
): void {
  setCentered(app, false);
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
      spectatorList(snap, myId),
    ),
  );
}

export function renderLiveResults(app: HTMLElement, snap: Snapshot, myId: string | null): void {
  setCentered(app, false);
  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    el(
      "div",
      { class: "live-label" },
      el("span", { class: "live-dot" }),
      el("h2", {}, "Live-Ergebnis"),
    ),
    el("div", { class: "timer" }, formatTime(snap.timeRemaining)),
    ranking(snap.players, myId, snap.winnerId),
    spectatorList(snap, myId),
  );
}

function ranking(
  people: PlayerSnapshot[],
  myId: string | null,
  winnerId: string | null,
): HTMLElement {
  return el(
    "ol",
    { class: "board" },
    ...people.map((p, i) =>
      el(
        "li",
        { class: [p.id === winnerId ? "winner" : "", p.id === myId ? "me" : ""].join(" ") },
        el("span", { class: "rank" }, `${i + 1}.`),
        el("span", { class: "nick" }, p.nickname),
        el("span", { class: "wertung" }, `${p.wertung} Wertung`),
      ),
    ),
  );
}

export function renderDisconnected(app: HTMLElement): void {
  setCentered(app, false);
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
