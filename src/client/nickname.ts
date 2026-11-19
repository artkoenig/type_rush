import { el } from "./dom.js";

/**
 * Full-screen prompt asking a (non-host) player for a nickname before joining.
 * Rendered on document.body so re-renders of #app (lobby/round/results) can
 * never destroy it.
 */
export function showNicknamePrompt(onSubmit: (nickname: string) => void): void {
  const overlay = document.createElement("div");
  overlay.className = "overlay";

  const input = document.createElement("input");
  input.className = "nickname";
  input.maxLength = 20;
  input.placeholder = "Dein Name";

  const submit = () => {
    onSubmit(input.value.trim() || "Spieler");
    overlay.remove();
  };

  const button = el("button", { class: "btn primary", on: { click: submit } }, "Los geht's");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  const row = el("div", { class: "row" }, input, button);
  const box = el(
    "div",
    { class: "overlay-box" },
    el("h1", {}, "Blind-Tippen"),
    el("p", {}, "Wie sollen wir dich nennen?"),
    row,
  );
  overlay.append(box);
  document.body.append(overlay);
  input.focus();
}
