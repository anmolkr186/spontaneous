/**
 * Which input the person used last, as `data-input="pointer" | "keyboard"` on
 * the root element. Focus rings in `tokens.css` and the components only draw
 * for the keyboard.
 *
 * The browser's own :focus-visible isn't enough: when a menu or popover closes
 * after a click, it hands focus back to its trigger programmatically, and
 * WebKit counts that as keyboard focus, so a ring appears around a key you
 * just clicked.
 */
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn"]);

let installed = false;

export function trackInputModality(root: HTMLElement = document.documentElement) {
  if (installed) return;
  installed = true;
  const set = (mode: "pointer" | "keyboard") => { if (root.dataset.input !== mode) root.dataset.input = mode; };
  // Capture, so a handler that stops propagation can't hide the input from us.
  window.addEventListener("pointerdown", () => set("pointer"), { capture: true, passive: true });
  window.addEventListener("keydown", (e) => {
    // A modifier on its own, or a shortcut held with ⌘ or ⌃, isn't moving focus.
    if (MODIFIERS.has(e.key) || e.metaKey || e.ctrlKey) return;
    set("keyboard");
  }, { capture: true });
}
