import type { ReactNode } from "react";
import { SiteShell } from "witness-tree";

// SiteHeader's skip link is position:fixed and parks at translateY(-160%). The
// transform makes this the containing block for it and the overflow hides the
// parked state, so the card shows what a reader sees before focus rather than a
// sliver of the pill over the card's top edge.
const Frame = ({ children }: { children: ReactNode }) => (
  <div style={{ position: "relative", transform: "translateZ(0)", overflow: "hidden" }}>{children}</div>
);

// The shell is the whole chrome: header above, footer below, the page's own
// <main id="main"> between them — the id the header's skip link targets. Every
// route in app/ is written this way, so a cell that wrapped an empty div would
// show none of what the component is for.
//
// The content here is the real 404 page (app/en/not-found.tsx and its French
// twin), trimmed to the masthead. It is the shortest real page on the site,
// which is what lets the header, the content and the sand footer band all sit
// inside one card.

export const NotFoundPage = () => (
  <Frame>
  <SiteShell locale="en">
    <main id="main" className="page-wrap">
      <header className="masthead">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
      </header>
    </main>
  </SiteShell>
  </Frame>
);

export const RecordPage = () => (
  <Frame>
  <SiteShell locale="en">
    <main id="main" className="page-wrap">
      <section className="content-section prose-measure">
        <div className="section-heading">
          <span className="num">02</span>
          <h2>A record, not a dashboard</h2>
        </div>
        <p className="lead">
          Search a place or open a record. Read a dated history of recorded harvest, wildfire,
          disturbance and satellite-detected change, with the source attached to every claim.
        </p>
      </section>
    </main>
  </SiteShell>
  </Frame>
);

export const NotFoundFrench = () => (
  <Frame>
  <SiteShell locale="fr">
    <main id="main" className="page-wrap">
      <header className="masthead">
        <p className="eyebrow">404</p>
        <h1>Page introuvable</h1>
      </header>
    </main>
  </SiteShell>
  </Frame>
);
