import type { ReactNode } from "react";
import { ThemeToggle } from "witness-tree";

// Three native radios, not a two-state switch: "System" means follow the
// operating system, and that is a real third value. The control's state is not
// a prop — it is the reader's stored choice, read through useSyncExternalStore
// from the key lib/theme.ts owns — so each cell writes that key before the
// control reads it, exactly as clicking the control would. Nothing is faked:
// DarkChosen really does put the document on the dark palette, which is why the
// surrounding panel in that cell is dark too.
//
// The last cell returns the key to "system", so the stored choice a card leaves
// behind is the site's default rather than an override.

const THEME_STORAGE_KEY = "witness-tree-theme";

function storeChoice(choice: "system" | "light" | "dark") {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage throws outright in some privacy configurations; the control's own
    // in-memory fallback then holds the choice, so the cell still renders.
  }
}

// The control ships inside the header's nav panel, which is a 220px-plus
// floating card — not the full width of a page. The panel width is what makes
// the stacked rows read correctly, so the cell supplies it.
const NavPanel = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: "grid",
      width: "292px",
      padding: "10px",
      borderRadius: "12px",
      border: "1px solid var(--rule)",
      background: "var(--surface)",
    }}
  >
    {children}
  </div>
);

export const SystemChosen = () => {
  storeChoice("system");
  return (
    <NavPanel>
      <ThemeToggle locale="en" />
    </NavPanel>
  );
};

export const DarkChosen = () => {
  storeChoice("dark");
  return (
    <NavPanel>
      <ThemeToggle locale="en" />
    </NavPanel>
  );
};

export const French = () => {
  storeChoice("system");
  return (
    <NavPanel>
      <ThemeToggle locale="fr" />
    </NavPanel>
  );
};
