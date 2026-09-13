import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { SiteHeader } from "witness-tree";

// The sticky pill that sits in the shell on every page: wordmark, the primary
// navigation as a <details> disclosure, the colour-theme control inside that
// panel, and the language switch.
//
// The nav row only goes inline above 1180px — the breakpoint was set from the
// French row, which is the widest the site has. Below it the same links live in
// the disclosure panel, and a closed card would never show them. MenuOpen and
// MenuOpenFrench therefore open the native <details> after mount, which is the
// one reader action that reveals the panel; nothing about the markup is faked.
// French is the interesting half: "Méthodes / Données / Recherche" plus
// "Système / Clair / Sombre" is the row that decides the breakpoint.

// The header's skip link is position:fixed and parks at translateY(-160%),
// so outside a real page it escapes to the card viewport and its bottom edge
// peeks over the top of the card. The transform makes this wrapper the
// containing block for fixed descendants and the overflow hides the parked
// state — which is exactly what a reader sees on the site before it is focused.
const Page = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      background: "var(--ground)",
      paddingBottom: "24px",
      position: "relative",
      transform: "translateZ(0)",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

function HeaderWithMenuOpen({ locale }: { locale: "en" | "fr" }) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    frame.current?.querySelector("details.nav-disclosure")?.setAttribute("open", "");
  }, []);
  return (
    <Page>
      <div ref={frame} style={{ minHeight: "330px" }}>
        <SiteHeader locale={locale} />
      </div>
    </Page>
  );
}

export const English = () => (
  <Page>
    <SiteHeader locale="en" />
  </Page>
);

export const MenuOpen = () => <HeaderWithMenuOpen locale="en" />;

export const French = () => (
  <Page>
    <SiteHeader locale="fr" />
  </Page>
);

export const MenuOpenFrench = () => <HeaderWithMenuOpen locale="fr" />;
