import type { Metadata } from "next";
import Link from "next/link";
import { HomeSearch, ProvinceBar, SiteShell } from "@/components/site";
import { ProvinceRecordList } from "@/components/site/ProvinceRecordList";
import { CumulativeHeadline } from "@/components/site/CumulativeHeadline";
import { RecoveryAnswer } from "@/components/site/RecoveryAnswer";
import { PRODUCT_NAME } from "@/lib/domain";
import { HARVEST_FIRE_ROUTES } from "@/lib/harvest-fire";
import { provinceSpanReach } from "@/lib/explore/period";
import { EXPLORE_PRODUCTION_LAYER, provinceSpanDisplayRows } from "@/lib/explore";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("en", { en: "/en", fr: "/fr" });

const SPAN_ROWS = provinceSpanDisplayRows({ fromYear: 1984, toYear: 2022 });

/*
 * The page asks a question in its headline, so it answers it in its own body,
 * and then gets out of the way (audit 2026-11-10, A1 and A3 to A9).
 *
 * It was about nine screens at desktop width. Each section that went has a
 * home of its own, and the page links there instead of repeating it: the
 * evidence marks on "How figures are marked", the province gap notes on "What
 * the record cannot see", recovery in Explore, the harvest pages and downloads
 * on Data, the town and riding rankings on Compare, and the limits at the end
 * of Methods. What stays is the question, one figure with its minimum, the
 * four provinces in a line each, and three ways in.
 */
export default function EnglishHome() {
  return <SiteShell locale="en"><main id="main" className="page-wrap">
    <header className="masthead masthead--record">
      <h1>What happened to the forest here?</h1>
      <p className="dek">{PRODUCT_NAME.en} shows forest loss in British Columbia, Alberta, Ontario, and Québec from 1984 to 2022 from satellite imagery and public records.</p>
      <p className="masthead-note"><Link href="/en/explore">Explore the map</Link></p>
      <HomeSearch locale="en" />
      <ProvinceBar locale="en" />
    </header>

    {/*
      The answer to the question in the h1, immediately under it.
      It carries its own denominator, its own unmapped share and its own
      minimum, so it stays honest when it is read alone.
    */}
    <CumulativeHeadline locale="en" />

    <section className="content-section home-provinces" aria-labelledby="current-record">
      <h2 id="current-record">By province, {provinceSpanReach("en")}</h2>
      <ProvinceRecordList rows={SPAN_ROWS} locale="en" labelledBy="current-record" />
      <p className="home-provinces-more">
        <Link href="/en/explore?from=1984&year=2022">See the four provinces on the map, {provinceSpanReach("en")}</Link>
        {" · "}
        <Link href="/en/unknown">What the record cannot see</Link>
      </p>
      <p><small>The record covers these four provinces only.</small></p>
    </section>

    <nav className="content-section home-doors" aria-labelledby="home-doors">
      <h2 id="home-doors" className="sr-only">Where to go next</h2>
      <div className="record-grid">
        <article className="record-card"><h3>The map</h3><p>Forest loss across the four provinces, year by year.</p><Link href="/en/explore">Explore the map</Link></article>
        {/* The id keeps Explore's old link to the home rankings landing on their way in. */}
        <article className="record-card" id="ridings-most-lost"><h3>Ridings and towns</h3><p>Compare two places, or see which lost the most forest.</p><Link href="/en/compare?rank=cities#rankings">Compare ridings and towns</Link></article>
        <article className="record-card"><h3>Logged or burned</h3><p>What was harvested and what burned, by province and year.</p><Link href={HARVEST_FIRE_ROUTES.en}>See harvest and fire</Link></article>
      </div>
    </nav>

    <section className="content-section home-more" aria-label="More from the record">
      <RecoveryAnswer locale="en" />
      <p>Official harvest figures, timber volumes and every download are on the <Link href="/en/data">Data</Link> page.</p>
    </section>

    {/*
      One line of limits. The list of what the site does not claim is the last
      section of Methods, where this links.
    */}
    <section className="content-section home-caveat" aria-labelledby="limits">
      <h2 id="limits" className="sr-only">What this site doesn’t claim</h2>
      <p>A satellite can see that trees are gone, but not why, and detected loss is a minimum. These are figures for {provinceSpanReach("en", "span")}. <Link href="/en/methods#limits">What this site doesn’t claim, and how the methods work</Link></p>
      <p><small>Context source: {EXPLORE_PRODUCTION_LAYER.attribution.en} <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>Source catalogue</a>.</small></p>
    </section>
  </main></SiteShell>;
}
