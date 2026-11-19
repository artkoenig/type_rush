/** Tiny DOM helper: create an element with class, text and event handlers. */
export interface ElOptions {
  class?: string;
  text?: string;
  on?: Record<string, (event: Event) => void>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.on) {
    for (const [type, handler] of Object.entries(options.on)) {
      node.addEventListener(type, handler);
    }
  }
  for (const child of children) node.append(child);
  return node;
}
