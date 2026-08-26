import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { PRODUCT_NAME } from "@/lib/domain";

export const metadata: Metadata = { title: "Public forest-change record", alternates: { languages: { en: "/en", fr: "/fr" } } };

export default function EnglishHome() {
  return <SiteShell locale="en"><main id="main" className="page-wrap">
    <header className="masthead">
      <p className="eyebrow">Evidence record · 1984 to present</p>
      <h1>What happened to the forest here?</h1>
      <p className="dek">{PRODUCT_NAME.en} helps you understand recorded and observed forest change in four provinces. Every result shows what the evidence says, where it came from, how current it is, and what it cannot tell you.</p>
      <div className="meta-row"><span>British Columbia</span><span>Alberta</span><span>Ontario</span><span>Quebec</span></div>
    </header>
    <section className="content-section prose-measure">
      <div className="section-heading"><span className="num">01</span><h2>A record, not a dashboard</h2></div>
      <p className="lead">Search a place or open a record. Read a dated history of recorded harvest, wildfire, disturbance and satellite-observed change—with the source attached to every claim.</p>
      <dl className="principles">
        <div className="principle"><dt>Official record</dt><dd>A public authority records an event, perimeter, intervention or named role.</dd></div>
        <div className="principle"><dt>Satellite observation</dt><dd>Imagery shows tree-cover reduction or later canopy recovery. It does not, by itself, establish a cause.</dd></div>
        <div className="principle"><dt>Derived estimate</dt><dd>A calculation made from documented records and a published method.</dd></div>
        <div className="principle"><dt>Unknown</dt><dd>No authoritative public record has been integrated for the question. An absence in this record is not a claim about what happened in the world.</dd></div>
      </dl>
    </section>
    <section className="content-section">
      <div className="section-heading"><span className="num">02</span><h2>Read the record</h2></div>
      <div className="record-grid">
        <article className="record-card"><p className="eyebrow">Components</p><h3>Evidence before numbers</h3><p>Inspect how figures, unknowns, confidence, coverage and provenance will appear across the public record.</p><a href="/en/components">Open the component gallery</a></article>
        <article className="record-card"><p className="eyebrow">Methods</p><h3>Definitions before numbers</h3><p>See the forest denominator, evidence classes, confidence rules, coverage grades and matching method.</p><a href="/en/methods">Read the methods</a></article>
        <article className="record-card"><p className="eyebrow">Data status</p><h3>Illustrative sources only</h3><p>No production dataset is integrated yet. Review the strict source-ledger contract and the gates that must pass before publication.</p><a href="/en/data">Review data transparency</a></article>
      </div>
      <aside className="notice"><h3>What this record does not claim</h3><p>{PRODUCT_NAME.en} does not estimate merchantable timber, predict wildfire spread, label detected change as logging or deforestation, make legal or compliance findings, or infer responsibility from proximity.</p></aside>
    </section>
  </main></SiteShell>;
}
