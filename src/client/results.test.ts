// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hideResults, renderLobby, shouldShowResults, showResults } from "./views.js";
import type { Snapshot } from "../engine/engine.js";

const actions = { signUp: () => {} };

/** A lobby snapshot after a round ended: results present, some spectators. */
function resultsLobby(roundNumber = 2): Snapshot {
  return {
    phase: "lobby",
    players: [],
    spectators: [
      { id: "s1", nickname: "Ben" },
      { id: "s2", nickname: "Lena" },
    ],
    lastRoundResults: [
      {
        id: "p1",
        nickname: "Falk",
        correct: 70,
        errors: 3,
        total: 73,
        cursor: 70,
        wertung: 182,
        typingElapsed: 60,
      },
      {
        id: "p2",
        nickname: "Mira",
        correct: 58,
        errors: 4,
        total: 62,
        cursor: 58,
        wertung: 147,
        typingElapsed: 60,
      },
    ],
    text: "",
    timeRemaining: 17,
    countdownWord: null,
    winnerId: "p1",
    roundNumber,
  };
}

/** A lobby with no finished round yet (first lobby). */
function emptyLobby(): Snapshot {
  return { ...resultsLobby(0), lastRoundResults: [], winnerId: null, timeRemaining: 30 };
}

function app(): HTMLElement {
  const a = document.createElement("div");
  a.id = "app";
  document.body.append(a);
  return a;
}

beforeEach(() => {
  hideResults();
  document.body.innerHTML = "";
});

describe("renderLobby", () => {
  it("no longer renders the results board inline", () => {
    const a = app();
    renderLobby(a, resultsLobby(), "p1", actions);
    expect(a.querySelector(".board")).toBeNull();
    // the lobby chrome is still there (spectator count + controls)
    expect(a.querySelector(".stat")).not.toBeNull();
    expect(a.querySelector(".controls")).not.toBeNull();
  });
});

describe("shouldShowResults", () => {
  it("shows for a finished round not yet dismissed", () => {
    expect(shouldShowResults(resultsLobby(2), null)).toBe(true);
    expect(shouldShowResults(resultsLobby(2), 1)).toBe(true);
  });
  it("does not show once that round was dismissed", () => {
    expect(shouldShowResults(resultsLobby(2), 2)).toBe(false);
  });
  it("does not show when there are no results", () => {
    expect(shouldShowResults(emptyLobby(), null)).toBe(false);
  });
});

describe("showResults / hideResults", () => {
  it("opens a dialog with the board and a Schließen button, focused", () => {
    const a = app();
    renderLobby(a, resultsLobby(), "p1", actions);
    const onClose = vi.fn();
    showResults(resultsLobby(), "p1", onClose);

    const overlay = document.body.querySelector(".results-overlay") as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute("role")).toBe("dialog");
    expect(overlay.querySelector(".board")).not.toBeNull();
    const button = overlay.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("Schließen");
    expect(document.activeElement).toBe(button);
  });

  it("is idempotent while open (one overlay, even across re-renders)", () => {
    const a = app();
    renderLobby(a, resultsLobby(), "p1", actions);
    showResults(resultsLobby(), "p1", () => {});
    renderLobby(a, resultsLobby(), "p1", actions); // per-second re-render of #app
    showResults(resultsLobby(), "p1", () => {});
    expect(document.body.querySelectorAll(".results-overlay")).toHaveLength(1);
  });

  it("closes on button click, calling onClose and removing the overlay", () => {
    const a = app();
    renderLobby(a, resultsLobby(), "p1", actions);
    const onClose = vi.fn();
    showResults(resultsLobby(), "p1", onClose);
    (document.body.querySelector(".results-overlay button") as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector(".results-overlay")).toBeNull();
  });

  it("closes on Escape", () => {
    const a = app();
    renderLobby(a, resultsLobby(), "p1", actions);
    const onClose = vi.fn();
    showResults(resultsLobby(), "p1", onClose);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector(".results-overlay")).toBeNull();
  });

  it("returns focus to the previously focused element on close", () => {
    const a = app();
    renderLobby(a, resultsLobby(), "p1", actions);
    const target = a.querySelector(".controls .btn") as HTMLButtonElement;
    target.focus();
    const onClose = vi.fn();
    showResults(resultsLobby(), "p1", onClose);
    (document.body.querySelector(".results-overlay button") as HTMLButtonElement).click();
    expect(document.activeElement).toBe(target);
  });

  it("hideResults is a no-op when nothing is open", () => {
    expect(() => hideResults()).not.toThrow();
    expect(document.body.querySelector(".results-overlay")).toBeNull();
  });
});
