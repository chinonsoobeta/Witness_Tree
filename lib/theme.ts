/**
 * The reader's colour-theme choice, shared by the boot script and the control.
 *
 * Three states, not two. "System" is not a synonym for light: it means the page
 * follows the operating system, which is what a reader who has set a schedule on
 * their device expects and what the stylesheet already does by default. Light and
 * dark are explicit overrides that outlive the visit.
 *
 * The storage contract is deliberately asymmetric: an explicit choice writes a
 * key, and returning to "system" deletes it. Absence therefore means "no override",
 * so a reader who clears site data lands back on the default rather than on a
 * theme some earlier visit happened to pick.
 */
export const THEME_STORAGE_KEY = "witness-tree-theme";

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && (THEME_CHOICES as readonly string[]).includes(value);
}

/**
 * Applies a choice to the document. `system` removes the attribute rather than
 * writing a value, because the stylesheet's dark palette is scoped to
 * `:root:not([data-theme="light"])` inside the system media query: the absence of
 * the attribute is what lets the operating system decide.
 */
export function applyTheme(choice: ThemeChoice, root: HTMLElement): void {
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/**
 * The pre-paint boot script, inlined as the first thing in the document body.
 *
 * It has to run before the first paint, so it cannot wait for the React bundle:
 * a stored dark choice applied after hydration would show the reader a full
 * flash of the light palette on every navigation. It is written defensively
 * because `localStorage` throws outright in some privacy configurations, and a
 * theme preference is never worth breaking a page over.
 *
 * Kept as a string literal rather than a compiled module because it must be
 * inline; a `<script src>` would be a second blocking request for 150 bytes.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;
