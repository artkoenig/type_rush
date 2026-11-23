import type { PlayerSnapshot, Snapshot } from "../engine/engine.js";
import { el } from "./dom.js";
import { fingerLabel, renderKeyboard } from "./keyboard.js";
import { fingerFor } from "../engine/fingerMap.js";

export interface Actions {
  signUp(): void;
}

function timerDisplay(seconds: number): HTMLElement {
  return el("div", { class: "timer", aria: { live: "polite" } }, formatTime(seconds));
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

function spectatorStat(count: number): HTMLElement {
  return el(
    "div",
    { class: "stat" },
    el("span", { class: "stat-value" }, String(count)),
    el("span", { class: "stat-label" }, " Zuschauer"),
  );
}

/**
 * Lobby: the roster, the spectator count, and the 30s participation timer.
 * The last round's highscore table is NOT rendered here — it is shown as a
 * dismissable popover (see showResults) the moment a round ends.
 * Spectators can sign up for the next round; the game auto-starts, nobody presses Start.
 */
export function renderLobby(
  app: HTMLElement,
  snap: Snapshot,
  myId: string | null,
  actions: Actions,
): void {
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
    timerDisplay(snap.timeRemaining),
    playerList(snap, myId),
    ...(snap.spectatorsCount > 0 ? [spectatorStat(snap.spectatorsCount)] : []),
    controls,
  );
}

/**
 * Whether the results popover should be open for this lobby snapshot: there must be
 * a finished round to show, and that round must not have been dismissed already.
 * `dismissedRound` is the roundNumber the user closed the popover for (null = never).
 */
export function shouldShowResults(snap: Snapshot, dismissedRound: number | null): boolean {
  return snap.lastRoundResults.length > 0 && snap.roundNumber !== dismissedRound;
}

/**
 * The last round's highscore table as a modal popover, rendered on document.body so
 * per-second re-renders of #app can neither destroy it nor steal focus. One primary
 * action ("Schließen"); also closable via Esc. Focus moves into the dialog on open
 * and returns to the previously focused element on close.
 */
let resultsOverlay: HTMLElement | null = null;
let resultsKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let resultsPrevFocus: Element | null = null;

export function showResults(snap: Snapshot, myId: string | null, onClose: () => void): void {
  if (resultsOverlay !== null) return; // already open for this round
  const doClose = () => {
    onClose();
    hideResults();
  };
  const overlay = el("div", {
    class: "overlay results-overlay",
    aria: { modal: "true", labelledby: "results-title" },
  });
  overlay.setAttribute("role", "dialog");
  const close = el("button", { class: "btn primary", on: { click: doClose } }, "Schließen");
  const title = el("h2", {}, "Letzte Runde");
  title.id = "results-title";
  const box = el(
    "div",
    { class: "overlay-box results-box" },
    title,
    ranking(snap.lastRoundResults, myId, snap.winnerId),
    close,
  );
  overlay.append(box);
  document.body.append(overlay);
  resultsOverlay = overlay;
  resultsPrevFocus = document.activeElement;
  close.focus();
  resultsKeyHandler = (e) => {
    if (e.key === "Escape") doClose();
  };
  document.addEventListener("keydown", resultsKeyHandler);
}

/** Removes the results popover (no-op if not open) and restores the previous focus. */
export function hideResults(): void {
  if (resultsOverlay === null) return;
  resultsOverlay.remove();
  resultsOverlay = null;
  if (resultsKeyHandler !== null) {
    document.removeEventListener("keydown", resultsKeyHandler);
    resultsKeyHandler = null;
  }
  (resultsPrevFocus instanceof HTMLElement ? resultsPrevFocus : document.body).focus();
  resultsPrevFocus = null;
}

/** Countdown: a big number, then the round starts automatically. */
export function renderCountdown(app: HTMLElement, snap: Snapshot): void {
  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    el(
      "div",
      { class: "timer countdown-word", aria: { live: "assertive" } },
      snap.countdownWord ?? "",
    ),
    ...(snap.spectatorsCount > 0 ? [spectatorStat(snap.spectatorsCount)] : []),
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
    ...(snap.spectatorsCount > 0 ? [spectatorStat(snap.spectatorsCount)] : []),
  );

  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    timerDisplay(snap.timeRemaining),
    chars,
    keyboard,
    hint,
    stats,
  );
}

export function renderLiveResults(app: HTMLElement, snap: Snapshot, myId: string | null): void {
  app.replaceChildren(
    el("h1", {}, "TYPE RUSH"),
    el(
      "div",
      { class: "live-label" },
      el("span", { class: "live-dot" }),
      el("h2", {}, "Live-Ergebnis"),
    ),
    timerDisplay(snap.timeRemaining),
    ranking(snap.players, myId, snap.winnerId),
    ...(snap.spectatorsCount > 0 ? [spectatorStat(snap.spectatorsCount)] : []),
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
