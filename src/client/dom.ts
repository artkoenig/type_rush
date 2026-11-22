/** Tiny DOM helper: create an element with class, text, event handlers and ARIA attributes. */
export interface ElOptions {
  class?: string;
  text?: string;
  on?: Record<string, (event: Event) => void>;
  /** ARIA attributes to set (e.g. { "aria-live": "polite" }). */
  aria?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.aria) {
    for (const [attr, value] of Object.entries(options.aria)) {
      node.setAttribute(`aria-${attr}`, value);
    }
  }
  if (options.on) {
    for (const [type, handler] of Object.entries(options.on)) {
      node.addEventListener(type, handler);
    }
  }
  for (const child of children) node.append(child);
  return node;
}
