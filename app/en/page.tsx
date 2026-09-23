import type { Metadata } from "next";
import Link from "next/link";
import { HomeSearch, ProvinceBar, SiteShell } from "@/components/site";
import { ProvinceRecordList } from "@/components/site/ProvinceRecordList";
import { CumulativeHeadline } from "@/components/site/CumulativeHeadline";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceMarks } from "@/components/policy/EvidenceMarks";
import { PRODUCT_NAME } from "@/lib/domain";
import { provinceSpanReach } from "@/lib/explore/period";
import { EXPLORE_PRODUCTION_LAYER, formatUnknownSharePercent, provinceSpanMeasurements } from "@/lib/explore";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Public forest-loss record", alternates: localizedAlternates("en", { en: "/en", fr: "/fr" }) };

const SPAN_ROWS = provinceSpanMeasurements({ fromYear: 1984, toYear: 2022 });

function coverageLabel(row: (typeof SPAN_ROWS)[number]) {
  return `${formatUnknownSharePercent(row.unknownSharePercent, "en")} of the province was not mapped by the source; ${row.unmappedCharacter.en}`;
}

const UNKNOWN_CONTEXTS = Object.fromEntries(
  SPAN_ROWS.map((row) => [row.id, coverageLabel(row)]),
);

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
      <p className="dek">{PRODUCT_NAME.en} shows forest loss in four Canadian provinces, from satellite images and public records. Every fact links to its source.</p>
      <HomeSearch locale="en" />
      <ProvinceBar locale="en" />
    </header>

    {/*
      The answer to the question in the h1, immediately under it.
      It carries its own denominator, its own unmapped share and its own
      refusal of the annual sum, so it does not lean on the standing
      coverage banner below it to stay honest when it is read alone.
    */}
    <CumulativeHeadline locale="en" />

    <CoverageStatement locale="en"><p>These numbers are a minimum. Satellites mapped only part of each province, and the rest is treated as unknown, never as zero. If something isn’t shown here, that doesn’t mean it didn’t happen.</p></CoverageStatement>

    {/*
      The four marks and their definitions, in one place. They used to be a
      row of chips here and a definition list of the same four classes
      several screens down, in different words.
    */}
    <section className="content-section evidence-band">
      <p className="evidence-band-lead">Each place has a dated history of harvests, wildfires and other changes. Every fact is marked with the kind of evidence behind it.</p>
      <EvidenceMarks locale="en" />
    </section>

    <section className="content-section landing-coverage" aria-labelledby="current-record">
      <h2 id="current-record">The published record</h2>
      <p className="lead">How much forest satellites detected as lost in each province, {provinceSpanReach("en")}. These figures are provisional, and each shows how much of the province could not be checked.</p>
      <ProvinceRecordList rows={SPAN_ROWS} locale="en" unknownContexts={UNKNOWN_CONTEXTS} />
      <p><Link href="/en/methods#coverage-gap">Why these areas were not mapped, and what we know about them</Link></p>
      <p><Link className="btn btn--primary" href="/en/explore">Explore the record</Link></p>
      <p><small>Other provinces are coming soon.</small></p>
    </section>

    <section className="content-section">
      <h2>Read the record</h2>
      <div className="record-grid">
        <article className="record-card"><p className="eyebrow">Components</p><h3>Evidence before numbers</h3><p>See how each figure is shown with its source and what we don’t know.</p><Link href="/en/components">Open the component gallery</Link></article>
        <article className="record-card"><p className="eyebrow">Methods</p><h3>Definitions before numbers</h3><p>What counts as forest, how the figures are worked out, and how sure we are.</p><Link href="/en/methods">Read the methods</Link></article>
        <article className="record-card"><p className="eyebrow">Data status</p><h3>Province data</h3><p>Download the province figures for {provinceSpanReach("en", "span")}, with their sources and limits.</p><Link href="/en/data">Review data transparency</Link></article>
      </div>
    </section>

    {/*
      One limits block. The old sections 02 and 04 both told the reader that a
      detected reduction in tree cover is not a finding about cause, in nearly
      the same words, several screens apart.
    */}
    <section className="content-section limits-block" aria-labelledby="limits">
      <h2 id="limits">What this record does not claim</h2>
      <div className="limits-body">
        <ul className="limits-list">
          <li>That a loss was caused by logging or deforestation.</li>
          <li>Any legal or compliance finding.</li>
          <li>How much sellable timber there is.</li>
          <li>Who is responsible, based on who is nearby.</li>
          <li>How a wildfire will spread.</li>
          <li>A complete total. Detected loss is a minimum.</li>
        </ul>
        <p>{PRODUCT_NAME.en} reports only what its sources record and what satellite images detect.</p>
        <p>A satellite can see that trees are gone, but not why. <Link href="/en/methods">How the methods work</Link>.</p>
        <p>The figures above are a technical preview for {provinceSpanReach("en", "span")}, not the final release. The loss patches on the Explore map are for viewing only: they can’t be added up, and no expert has reviewed them. <Link href="/en/data">Data, sources and licences</Link>.</p>
        <p><small>Context source: {EXPLORE_PRODUCTION_LAYER.attribution.en} <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>Source catalogue</a>.</small></p>
      </div>
    </section>
  </main></SiteShell>;
}
