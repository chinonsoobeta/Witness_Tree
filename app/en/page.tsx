import type { Metadata } from "next";
import Link from "next/link";
import { ProvinceBar, SiteShell } from "@/components/site";
import { ProvinceCoverageCard } from "@/components/site/ProvinceCoverageCard";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";
import { PRODUCT_NAME } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD, EXPLORE_PRODUCTION_LAYER, formatUnknownSharePercent } from "@/lib/explore";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Public forest-loss record", alternates: localizedAlternates("en", { en: "/en", fr: "/fr" }) };

function coverageLabel(row: (typeof EXPLORE_PRODUCTION_LAYER.rows)[number]) {
  return `${formatUnknownSharePercent(row.unknownSharePercent, "en")} of the province was not mapped by the source${"unmappedCharacter" in row ? `; ${row.unmappedCharacter.en}` : ""}`;
}

export default function EnglishHome() {
  return <SiteShell locale="en"><main id="main" className="page-wrap">
    <header className="masthead masthead--record">
      <p className="eyebrow">Evidence record · {EXPLORE_COVERAGE_PERIOD.en}</p>
      <h1>What happened to the forest here?</h1>
      <p className="dek">{PRODUCT_NAME.en} helps you understand recorded and detected forest loss in four provinces.</p>
      <ProvinceBar locale="en" />
    </header>
    <CoverageStatement locale="en"><p>Detected loss is a minimum from the mapped area in four provinces. Areas the source did not map remain unknown, even where detected loss is small.</p></CoverageStatement>
    <EvidenceLegend locale="en" />
    <section className="content-section landing-coverage" aria-labelledby="current-record">
      <div className="section-heading"><span className="num">01</span><h2 id="current-record">Start with the current record</h2></div>
      <p className="lead">The bounded, provisional {EXPLORE_PRODUCTION_LAYER.period} province aggregate is available to explore. It reports detected forest loss with a coverage state for each province. Verification of the mapped extent for every year in {EXPLORE_COVERAGE_PERIOD.en} is complete. Its results now govern how areas the source did not map are classified.</p>
      <p className="prose-measure">All bars share a hectare scale. The unmapped area is not a measurement of forest loss.</p>
      <div className="province-coverage-grid">
        {EXPLORE_PRODUCTION_LAYER.rows.map((row) => <ProvinceCoverageCard key={row.id} row={row} locale="en" unknownContext={coverageLabel(row)} />)}
      </div>
      <p><Link href="/en/methods#coverage-gap">Why these areas were not mapped, and what we know about them</Link></p>
      <p><Link className="btn btn--primary" href="/en/explore">Explore the province aggregate</Link></p>
      <p><small>Other provinces are coming soon.</small></p>
    </section>
    <section className="content-section prose-measure">
      <div className="section-heading"><span className="num">02</span><h2>A record, not a dashboard</h2></div>
      <p className="lead">Search a place or open a record. Read a dated history of recorded harvest, wildfire, disturbance and satellite-detected change, with the source attached to every claim.</p>
      <dl className="principles">
        <div className="principle"><dt>Official record</dt><dd>A public authority records an event, perimeter, intervention or named role.</dd></div>
        <div className="principle"><dt>Satellite observation</dt><dd>Imagery shows tree-cover reduction or later canopy recovery. It does not, by itself, establish a cause.</dd></div>
        <div className="principle"><dt>Derived estimate</dt><dd>A calculation made from documented records and a published method.</dd></div>
        <div className="principle"><dt>Unknown</dt><dd>No authoritative public record has been integrated for the question. An absence in this record is not a claim about what happened in the world.</dd></div>
      </dl>
    </section>
    <section className="content-section">
      <div className="section-heading"><span className="num">03</span><h2>Read the record</h2></div>
      <div className="record-grid">
        <article className="record-card"><p className="eyebrow">Components</p><h3>Evidence before numbers</h3><p>Inspect how figures, unknowns, confidence, coverage and provenance will appear across the public record.</p><Link href="/en/components">Open the component gallery</Link></article>
        <article className="record-card"><p className="eyebrow">Methods</p><h3>Definitions before numbers</h3><p>See the forest denominator, evidence classes, confidence rules, coverage grades and matching method.</p><Link href="/en/methods">Read the methods</Link></article>
        <article className="record-card"><p className="eyebrow">Data status</p><h3>Bounded province release</h3><p>The 2020 to 2022 province aggregate is published with its source, coverage state and limits. Other views may still use clearly labelled examples.</p><Link href="/en/data">Review data transparency</Link></article>
      </div>
      <aside className="notice"><h3>What this record does not claim</h3><p>{PRODUCT_NAME.en} does not estimate merchantable timber, predict wildfire spread, label detected change as logging or deforestation, make legal or compliance findings, or infer responsibility from proximity.</p></aside>
    </section>
    <section className="content-section prose-measure" aria-labelledby="consequences">
      <div className="section-heading"><span className="num">04</span><h2 id="consequences">Why the context matters</h2></div>
      <p>Detected forest loss is a satellite-derived measure, not a finding about cause. A detected reduction in tree cover does not by itself establish logging, deforestation, responsibility or compliance. <Link href="/en/methods">Read the method and evidence definitions</Link>.</p>
      <p>The available release is a deterministic, four-province province-level technical preview for 2020 to 2022. It is not per-cell geometry and does not complete the formal Phase 2 gate. <Link href="/en/data">Read the release scope, provenance and licence attribution</Link>.</p>
      <p><small>Context source: {EXPLORE_PRODUCTION_LAYER.attribution.en} <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>Source catalogue</a>.</small></p>
    </section>
  </main></SiteShell>;
}
