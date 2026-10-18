/** Moves focus after Angular has rendered the new content (the app runs without zone.js). */
export function focusSoon(id: string): void {
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.focus()));
}
