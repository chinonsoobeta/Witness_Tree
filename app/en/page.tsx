import type { Metadata } from "next";
import Link from "next/link";
import { HomeSearch, ProvinceBar, SiteShell } from "@/components/site";
import { ProvinceCoverageCard } from "@/components/site/ProvinceCoverageCard";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";
import { PRODUCT_NAME } from "@/lib/domain";
import { productionAggregatePeriod } from "@/lib/explore/period";
import { EXPLORE_PRODUCTION_LAYER, formatUnknownSharePercent } from "@/lib/explore";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Public forest-loss record", alternates: localizedAlternates("en", { en: "/en", fr: "/fr" }) };

function coverageLabel(row: (typeof EXPLORE_PRODUCTION_LAYER.rows)[number]) {
  return `${formatUnknownSharePercent(row.unknownSharePercent, "en")} of the province was not mapped by the source${"unmappedCharacter" in row ? `; ${row.unmappedCharacter.en}` : ""}`;
}

/*
 * The page asks a question in its headline, so it answers it in its own body.
 *
 * Three things changed and each of them removed something rather than adding
 * to it. The search field is under the question instead of being the fifth
 * item in the global nav. The numbered sections 01 to 04 are gone: they were
 * never a sequence, and two of them stated the same caveat, so they collapse
 * into the evidence marks plus a single limits block. The span rides on each
 * figure instead of on a masthead badge that claimed 1984 to 2022 over
 * figures covering three years.
 */
export default function EnglishHome() {
  return <SiteShell locale="en"><main id="main" className="page-wrap">
    <header className="masthead masthead--record">
      <p className="eyebrow">Public forest-loss record</p>
      <h1>What happened to the forest here?</h1>
      <p className="dek">{PRODUCT_NAME.en} reports recorded and detected forest loss in four provinces, with the source attached to every claim.</p>
      <HomeSearch locale="en" />
      <ProvinceBar locale="en" />
    </header>

    <CoverageStatement locale="en"><p>Detected loss is a minimum from the mapped area in four provinces. Areas the source did not map remain unknown, even where detected loss is small. An absence in this record is not a claim about what happened in the world.</p></CoverageStatement>

    <EvidenceLegend locale="en" />

    <section className="content-section landing-coverage" aria-labelledby="current-record">
      <h2 id="current-record">The published record</h2>
      <p className="lead">The bounded, provisional {productionAggregatePeriod("en")} province aggregate reports detected forest loss with a coverage state for each province. Verification of the mapped extent for every year is complete, and its results govern how unmapped areas are classified.</p>
      <div className="province-coverage-grid">
        {EXPLORE_PRODUCTION_LAYER.rows.map((row) => <ProvinceCoverageCard key={row.id} row={row} locale="en" unknownContext={coverageLabel(row)} />)}
      </div>
      <p><Link href="/en/methods#coverage-gap">Why these areas were not mapped, and what we know about them</Link></p>
      <p><Link className="btn btn--primary" href="/en/explore">Explore the record</Link></p>
      <p><small>Other provinces are coming soon.</small></p>
    </section>

    <section className="content-section prose-measure">
      <h2>A record, not a dashboard</h2>
      <p className="lead">Open a record and read a dated history of recorded harvest, wildfire, disturbance and satellite-detected change. Every claim carries the class of evidence behind it.</p>
      <dl className="principles">
        <div className="principle"><dt>Official record</dt><dd>A public authority records an event, perimeter, intervention or named role.</dd></div>
        <div className="principle"><dt>Satellite observation</dt><dd>Imagery shows tree-cover reduction or later canopy recovery. It does not, by itself, establish a cause.</dd></div>
        <div className="principle"><dt>Derived estimate</dt><dd>A calculation made from documented records and a published method.</dd></div>
        <div className="principle"><dt>Unknown</dt><dd>No authoritative public record has been integrated for the question.</dd></div>
      </dl>
    </section>

    <section className="content-section">
      <h2>Read the record</h2>
      <div className="record-grid">
        <article className="record-card"><p className="eyebrow">Components</p><h3>Evidence before numbers</h3><p>Inspect how figures, unknowns, confidence, coverage and provenance appear across the public record.</p><Link href="/en/components">Open the component gallery</Link></article>
        <article className="record-card"><p className="eyebrow">Methods</p><h3>Definitions before numbers</h3><p>See the forest denominator, evidence classes, confidence rules, coverage grades and matching method.</p><Link href="/en/methods">Read the methods</Link></article>
        <article className="record-card"><p className="eyebrow">Data status</p><h3>Bounded province release</h3><p>The {productionAggregatePeriod("en", "span")} province aggregate is published with its source, coverage state and limits.</p><Link href="/en/data">Review data transparency</Link></article>
      </div>
    </section>

    {/*
      One limits block. The old sections 02 and 04 both told the reader that a
      detected reduction in tree cover is not a finding about cause, in nearly
      the same words, several screens apart.
    */}
    <section className="content-section prose-measure" aria-labelledby="limits">
      <h2 id="limits">What this record does not claim</h2>
      <p>{PRODUCT_NAME.en} does not estimate merchantable timber, predict wildfire spread, label detected change as logging or deforestation, make legal or compliance findings, or infer responsibility from proximity.</p>
      <p>Detected forest loss is satellite-derived. A reduction in tree cover does not by itself establish logging, deforestation, responsibility or compliance. <Link href="/en/methods">Read the method and evidence definitions</Link>.</p>
      <p>The province aggregate above is a deterministic, four-province technical preview for {productionAggregatePeriod("en", "span")}. Per-cell loss patches are drawn on the Explore map for the same four provinces, traced from the 30 m grid. They are drawn, not counted: no expert review has been completed, so they do not close the formal Phase 2 gate and no total may be taken from them. <Link href="/en/data">Read the release scope, provenance and licence attribution</Link>.</p>
      <p><small>Context source: {EXPLORE_PRODUCTION_LAYER.attribution.en} <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>Source catalogue</a>.</small></p>
    </section>
  </main></SiteShell>;
}
