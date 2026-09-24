// Tiny DOM builders shared by the UI screens. Everything is created here —
// no template sprawling, no framework.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

export function div(cls?: string, html?: string): HTMLDivElement {
  return el('div', cls, html);
}

export function button(cls: string, html: string): HTMLButtonElement {
  const b = el('button', cls, html);
  b.type = 'button';
  return b;
}

/** Escape user/content strings before they go through innerHTML. */
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      default: return '&quot;';
    }
  });
}
