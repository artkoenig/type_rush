// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { showNicknamePrompt } from "./nickname.js";
import { renderLobby } from "./views.js";
import { createGame, step, toSnapshot } from "../engine/engine.js";
import type { Snapshot } from "../engine/engine.js";

const actions = {
  startSession: () => {},
  start: () => {},
  setDuration: () => {},
  endSession: () => {},
};

function makeLobby(): Snapshot {
  let state = createGame();
  state = step(state, { type: "join", playerId: "host", nickname: "Host" }, () => 0).newState;
  state = step(state, { type: "startSession", playerId: "host" }, () => 0).newState;
  state = step(state, { type: "join", playerId: "p2", nickname: "Bob" }, () => 0).newState;
  return toSnapshot(state);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("nickname prompt", () => {
  it("survives a lobby re-render of #app", () => {
    const app = document.createElement("div");
    app.id = "app";
    document.body.append(app);
    showNicknamePrompt(() => {});
    expect(document.body.querySelector(".overlay")).not.toBeNull();
    renderLobby(app, makeLobby(), "p2", actions);
    expect(document.body.querySelector(".overlay")).not.toBeNull();
  });

  it("submits the typed nickname and closes", () => {
    const onSubmit = vi.fn();
    showNicknamePrompt(onSubmit);
    const input = document.querySelector(".nickname") as HTMLInputElement;
    input.value = "Bob";
    const button = document.querySelector(".overlay button") as HTMLButtonElement;
    button.click();
    expect(onSubmit).toHaveBeenCalledWith("Bob");
    expect(document.body.querySelector(".overlay")).toBeNull();
  });
});
