import type { ReactNode } from "react";
import { SiteFooter } from "witness-tree";

// The footer carries the coverage line — the published period and the four
// province codes, straight out of lib/explore — and the record-and-governance
// nav: eleven links in English, eleven in French, the pair that decides whether
// the three-column grid holds. It only ever takes the page's locale.
//
// The band sits on --sand with an 80px margin above it, so a cell that shows it
// alone loses the relationship it has to the content it closes. BelowPageContent
// keeps that, using the closing section of the English landing page.

const Page = ({ children }: { children: ReactNode }) => (
  <div style={{ background: "var(--ground)" }}>{children}</div>
);

export const English = () => (
  <Page>
    <SiteFooter locale="en" />
  </Page>
);

export const BelowPageContent = () => (
  <Page>
    <main id="main" className="page-wrap">
      <section className="content-section prose-measure" aria-labelledby="consequences">
        <div className="section-heading">
          <span className="num">04</span>
          <h2 id="consequences">Why the context matters</h2>
        </div>
        <p>
          Detected forest loss is a satellite-derived measure, not a finding about cause. A detected
          reduction in tree cover does not by itself establish logging, deforestation, responsibility
          or compliance.
        </p>
      </section>
    </main>
    <SiteFooter locale="en" />
  </Page>
);

export const French = () => (
  <Page>
    <SiteFooter locale="fr" />
  </Page>
);
