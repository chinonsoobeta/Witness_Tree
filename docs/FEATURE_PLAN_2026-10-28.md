# Feature plan, 2026-10-28

Status: proposal for the owner's review. Nothing in this document has been
implemented, approved or scheduled. Each feature below keeps the site's
publication rules: Unknown is never zero, every figure carries its evidence
class, coverage, provenance and limitations, English and French ship together,
the product name stays out of persistent identifiers, and no feature adds a
dependency, a service or a production claim without a demonstrated need and the
needed approval.

The eight features are in the order the owner asked for them. A suggested build
order is at the end, because three of them share one piece of plumbing.

| # | Feature | Size | Needs an owner decision | Depends on |
| --- | --- | --- | --- | --- |
| 9 | Reproduce it yourself | Medium | Zenodo account and DOI minting; which figure is the reference figure | Nothing |
| 10 | Mill closures beside harvest volume | Medium | A plan amendment: section 1.3 non-goals and section 14.2 attribution rules | Nothing |
| 5 | The Unknown Atlas | Medium | Which blocked-source and FOI facts may be published | Nothing |
| 4 | Within 10 km of me | Small | None (address lookup already uses a configured provider) | Nothing |
| 7 | Time-lapse export | Medium | None | Nothing |
| 1 | A receipt for every place | Medium | None | Real place pages (in progress on a separate branch) |
| 2 | Riding one-pagers | Medium | None | #1's renderer |
| 3 | Embedded figures | Medium | Terms wording for embeds | #1's renderer and real place pages |

"Small" is a day or two of one builder plus audit; "Medium" is about a week.

---

## 9. Reproduce it yourself

**Goal.** A reader with a laptop recomputes one published figure from the
public source rasters and sees the published SHA-256 match. The site becomes
citable in papers with a DOI per release, and the Phase 9 quarterly
reproduction gate gets a public harness instead of an owner-only one.

**What exists.** `scripts/run-phase9-quarterly-reproducibility.mjs` is the
owner-side harness: it takes a frozen population of published figures, each
bound to raw-archive objects and a recomputation runner, draws a seeded sample
and records per-unit verdicts. `scripts/phase3_interval_zonal_aggregate.py` is
the riding and region method. `data/raw-archive-reproduction-drill.json` records
one passed drill. The Data page already publishes release identifiers and
checksums. The plan's Phase 9 exit criteria require a quarterly reproduction of
a published real figure.

**Design.**

1. Pick one reference figure that a laptop can recompute: a single province for
   a single annual interval (for example British Columbia, 2021 to 2022), whose
   inputs are two public VLCE2 annual rasters and the Statistics Canada 2021
   province boundary. Record its published value and the SHA-256 of the output
   row in a new `data/reproduction-reference-figure.json`.
2. Write `scripts/reproduce-reference-figure.py` with the same method as the
   zonal aggregate but bounded to one province and one interval, reading the two
   rasters by windowed blocks so memory stays under about 1 GB. It downloads the
   two source files from the NRCan catalogue URL in the source ledger (or takes
   local paths), verifies their published checksums first, computes, writes a
   one-row CSV and prints its SHA-256 next to the published one.
3. Publish a notebook (`docs/reproduce/reproduce-reference-figure.ipynb`,
   rendered to Markdown as well so it reads on GitHub) that runs the script with
   explanation at each step: what the forest definition is, why the share is
   over mapped forest only, where the Unknown area comes from and why it is not
   zero.
4. Data page: a "Reproduce a figure" section in both languages linking the
   notebook, stating the expected runtime and download size, and stating that a
   match proves the method reproduces the published figure, not that the figure
   is correct.
5. DOI: mint a Zenodo concept DOI for the repository releases and a version DOI
   per published release (`data/releases` already records release identifiers).
   Add the DOI to the citation block on the Data page and to the bulk-download
   manifest. The DOI is a persistent identifier, so it must not carry the
   product name in its metadata title beyond what Zenodo requires; use the
   release identifier as the title and the product name in the description.
6. Phase 9 tie-in: the reference figure becomes one unit in the quarterly
   population manifest, so the public notebook and the owner's harness run the
   same runner.

**Files.** `scripts/reproduce-reference-figure.py`, `docs/reproduce/`,
`data/reproduction-reference-figure.json` with a `check:` script in
package.json, `components/transparency/DataPage.tsx`, the bilingual strings,
`docs/RELEASES.md`, `docs/IMPLEMENTATION_STATUS.md`.

**Rules and decisions.** The notebook must say it reproduces, not validates.
The Zenodo deposit needs an owner account and a decision on the depositor name.
Raster downloads are about 1 to 2 GB per annual national file; state that
plainly, and offer a pre-clipped province pair hosted on the existing CloudFront
origin only if the licence (Open Government Licence Canada) and the delivery
evidence allow it, which they do for derived products already published there.

**Verification.** Run the script on the SSD data root and on a fresh download in
a clean environment; both must print the published SHA-256. Add a unit test
that the reference record's published value equals the value in the every-span
release for the same province and interval.

---

## 10. Mill closures beside harvest volume

**Goal.** Put the fact that motivated the site next to the record: the BC
harvest-volume page gains a timeline of primary timber-processing facilities
that opened, curtailed or closed, from an official provincial record, so a
reader sees volume, allowable cut and mill capacity on one axis of years.

**What exists.** `/en/data/bc-harvest-volume` renders
`data/bc-timber-harvest-aac-indicator.json` from Environmental Reporting BC. The
AB/ON/QC page renders National Forestry Database volumes and wood supply. The
plan forbids corporate ownership histories (section 1.3) and restricts naming
organisations to the exact role and date in an authoritative public record
(section 14.2), with a dispute route.

**Why this needs a plan amendment first.** A mill is owned by a company. Any
closure list names companies next to forest figures, which the plan calls the
highest-risk thing the product does. The feature is only buildable under a
recorded scope decision that says: facilities are listed from the Government of
British Columbia's Major Primary Timber Processing Facilities survey (published
annually under the Open Government Licence BC) with the facility name,
community, product type, year and status exactly as the survey records them;
no cause is stated or implied; no link is drawn between a facility and any
loss figure; and the organisation dispute route in section 14.2 is live before
publication. Alberta, Ontario and Québec have no equivalent open annual survey
that I have verified, so the first version is BC only and says so.

**Design, once amended.**

1. Source ledger row for the BC facilities survey with licence, catalogue URL,
   retrieval date and checksum, like every other row.
2. A transform that reduces the survey to year, facility, community, product
   class and status, and derives the yearly count of operating facilities and
   reported capacity where the survey publishes it. Blank cells stay Unknown.
3. On the BC volume page, a third series on the same year axis: operating
   facilities per year (official record), drawn as a separate panel under
   harvest and allowable cut, never overlaid on the volume bars, with the
   "different instruments" note the page already uses.
4. A facilities table filtered by year, with the survey's own wording, the
   record date and the dispute route.
5. A plain sentence that the survey counts facilities and capacity; it does not
   say why any facility closed.

**Files.** `data/bc-timber-facilities-<year>.json` with checker, a new
component under `components/transparency/`, additions to
`BcHarvestVolumeIndicator.tsx`, strings, `docs/SOURCE_LEDGER.md`, a decision
record under `data/` and `docs/`.

**Rules and decisions.** Owner records the scope decision and confirms the
dispute route recipient (the corrections route work in progress gives the
mechanism). Legal review of the attribution wording, because this is new legal
scope under the Phase 0 sign-off's own terms.

**Verification.** Checker binds the survey checksum; unit tests that no row
without a survey value renders a number; a claim-template test that the page
contains no causal wording (the existing prohibited-term gate can be extended).

---

## 5. The Unknown Atlas

**Goal.** One page that is only about what the record cannot see, in both
languages: where the satellite source has no data, which official figures are
withheld and why, which sources are access-blocked and what was asked of whom.
It turns the project's discipline into something a reader can look at, and it
is the page a reporter will cite.

**What exists.** Methods already lists the 46.4 million unmapped hectares by
province with reasons (`lib/explore/unmapped-reasons.ts`). The official-harvest
comparison withholds 14 rows under a personal-use licence. Nine
`data/*-access-block.json` records and `data/phase1-owner-decision-queue.json`
describe blocked sources, and `docs/DRAFT_BC_FTEN_FOI_REPLY_FOR-2026-056834.md`
records a freedom-of-information request. The Explore map hatches unmapped land.

**Design.**

1. Route `/en/unknown` and `/fr/inconnu` (names to be confirmed against the
   locale route table), in the Data section of the navigation.
2. Section A, land with no data: a static map (the province shading and
   hatching already built for Explore, rendered once as an SVG or a single map
   view) with the four province figures and reasons, and the sentence that no
   data never means no loss.
3. Section B, figures withheld: a table of every published view that withholds
   a figure and the reason class: licence (the 14 NFD rows), coverage (ridings
   and places with an unknown share above the tolerance), floor (areas under
   the 500 ha ranking floor), too recent (the 2015 to 2022 recovery decade).
   Each row links to the page where the withholding is shown.
4. Section C, sources we could not use: one row per access-blocked source from
   the ledger records: publisher, what it would add, the licence or access
   condition that blocks it, the date of the last request and its status, with
   the wording taken from the records and no speculation about motive.
5. Section D, what would settle it: field plots, air photos or lidar for the
   1984 forest question; written reuse terms for the blocked sources; a method
   accuracy study for detected loss. This is the Methods wording, gathered.

**Files.** `app/en/unknown`, `app/fr/inconnu`, `components/transparency/UnknownAtlas.tsx`,
a small loader `lib/sources/blocked.ts` that reads the access-block records
through a validator so the page cannot render a field the record lacks, strings,
sitemap and route table entries.

**Rules and decisions.** The owner decides which blocked-source facts are
public: the request dates and recipients are in the repository already, but a
public page is a different act. Name agencies and licences, never individuals.
The FOI file number is public once the request is logged by the province; the
owner confirms before it appears.

**Verification.** Unit test that every withheld figure on the comparison and
compare pages appears in Section B (generated from the same records, not typed
twice); bilingual parity; the accessibility contract (table captions, scoped
headers).

---

## 4. Within 10 km of me

**Goal.** A resident types an address or place and gets, without an account,
one answer for the circle around it: forest lost in the chosen years, the
Unknown part, and the ridings and region the point sits in.

**What exists.** `/api/address/search` resolves text through the configured
Places endpoint (`lib/address/query.ts`); `/api/shape/measure` measures a
polygon against the coarse grid with limits of 250 vertices, 40 tiles,
60,000 blocks and 2,000,000 ha (`worker/shape.ts`, `lib/shapes/coverage.ts`);
`/api/district/resolve` returns the districts containing a point; Draw and
measure already uses the shape endpoint and discards the shape. The plan's
account feature (saved areas) is blocked by Phase 6 gates; this feature stores
nothing and is outside them.

**Design.**

1. On the Draw page, a third shape type, "Circle", with a centre (from the
   address finder or a map click) and a radius select of 5, 10 and 25 km. A
   10 km circle is about 31,400 ha, far inside the limits. The circle is sent
   to the shape endpoint as a 64-vertex polygon; nothing new on the server.
2. The result block adds the containing federal and provincial ridings and the
   economic region from the district endpoint, each linking to its page, and
   the same three-part readout the Draw page already gives: measured land,
   land with no data, land outside the mapped area.
3. A home-page entry point, "What happened within 10 km of me", that opens the
   Draw page with the address finder focused.
4. Privacy: the address query goes to the configured provider exactly as the
   finder already sends it; the page says so in one line. No position is logged
   and no URL carries the address; the result URL carries only the rounded
   centre and radius, so it can be shared without the address text.

**Files.** `components/explore/DrawPage.tsx`, `ShapeDrawMap.tsx`,
`ShapeMeasureClient.tsx`, `lib/shapes/` (circle to polygon helper with a unit
test for area error at 64 vertices), `components/site/HomeSearch.tsx`, strings.

**Rules and decisions.** None new. The owner may want the radius capped at
25 km so the feature is not a back door to province-sized measurements, which
the shape limits already prevent.

**Verification.** Unit tests for the circle polygon; `npm run check:shape-measure`;
a rendered test that the result URL contains no address text.

---

## 7. Time-lapse export

**Goal.** A reader picks a riding, region or town, presses Play, and downloads
an animated file of its forest change across the record with the provenance
strip burned in, ready for a social post or a classroom.

**What exists.** The Explore year control has Play (`components/explore/ExploreYearControl.tsx`);
the harvest-and-fire page draws a chart to a canvas and downloads it as PNG
with flag, notes and sources (`components/transparency/HarvestFireDownloads.tsx`);
the per-cell patch layer renders one year at a time from the tile archive.

**Design.**

1. A client-side exporter that, for the chosen boundary and the full span,
   renders each annual interval's map frame to an offscreen canvas (the
   MapLibre map rendered with `preserveDrawingBuffer` only during export),
   stamps the year, the boundary name and edition, the data version, the
   evidence class and the licence line on each frame, and encodes the frames.
2. Encoding without a dependency: animated PNG (APNG) can be assembled in plain
   JavaScript from PNG frames, and every modern browser plays it. GIF needs an
   encoder; MP4 needs WebCodecs, which is not in Firefox everywhere. Start with
   APNG and a PNG contact sheet (all 38 frames on one image) as the universal
   fallback; add WebM through MediaRecorder where supported, since it needs no
   library either.
3. Limits: export the current map viewport only, at most 1280 pixels wide, so
   the browser does the work and no server is involved. Thirty-eight frames at
   that size is a few megabytes.
4. Placement: a "Download the years as an animation" button in the Explore
   readout when a boundary is selected, and on each real place page once those
   exist.

**Files.** `components/explore/TimelapseExport.tsx` (client island, lazy
loaded so it stays out of the Explore first-paint bundle and under the 400 KB
gate), `lib/explore/timelapse.ts` for frame stamping and APNG assembly with
unit tests on the chunk layout, strings.

**Rules and decisions.** Every frame carries the caveats (the screenshot rule in
plan section 9.3). The patches are simplified for display and a frame must not
show hectare totals for patches. No neutral-language violation: the file name
is the geography and the span, never a judgement.

**Verification.** Unit tests for the APNG writer against a known-good decoder in
the test runtime; a Playwright test that exports a two-frame animation and
checks its size and header; bundle gate.

---

## 1. A receipt for every place

**Goal.** Every community, riding and region has a share image that carries its
own caveats: the figure, the Unknown share, the coverage grade, the years, the
boundary edition, the data version and the licence line, burned into pixels.
Social previews and screenshots then travel honestly.

**What exists.** One static `public/og.png` for every page. The plan requires
a deterministic share-image generator that can be regenerated in one command
(section 1.4) and the screenshot rule (section 9.3). Next.js supports
`opengraph-image.tsx` per route with `ImageResponse`, which renders JSX to PNG
at build or request time with no extra dependency. BC Sans is the licensed
typeface and can be loaded into the renderer.

**Design.**

1. One renderer, `lib/share/receipt.tsx`, that takes a place record and locale
   and returns the image layout: product name (from the single token), place
   name and type, the whole-record figure or the Unknown statement, the
   coverage grade and unmapped share, the span, the boundary edition and data
   version, the evidence class, the licence line. Fixed 1200 by 630 pixels, the
   site's colour tokens, BC Sans.
2. `opengraph-image.tsx` and `twitter-image.tsx` under the real place routes
   in both locales, calling the renderer. Generated at build for the static
   pages, which is where the deterministic command lives: `next build`
   regenerates every image.
3. A "Download this card" link on each place page that serves the same image
   so a reader can post it directly, plus a copy-citation button beside it.
4. A determinism check: `scripts/check-share-images.mjs` renders a fixed sample
   of places and compares SHA-256 against a checked-in record, so a rename or a
   data release changes the record on purpose and a stray change fails CI.

**Files.** `lib/share/receipt.tsx` and tests, `app/en/<place routes>/opengraph-image.tsx`
and French pairs, `scripts/check-share-images.mjs`,
`data/share-image-sample-checksums.json`, strings, `docs/THIRD_PARTY.md` note
that BC Sans is embedded in generated images under its OFL.

**Rules and decisions.** None new. Depends on real place pages existing (in
progress). Build-time cost: about 6,000 images; measure the build and switch to
on-request generation with caching if it exceeds the Vercel build budget.

**Verification.** Checksum record; a rendered test that the og:image meta of a
place page points to its own image; bundle gate unaffected because the
renderer runs at build.

---

## 2. Riding one-pagers

**Goal.** A bilingual, print-ready PDF for every federal and provincial riding:
the figure, the Unknown share, the recovery share where the region admits it,
the harvest and fire series for its province, the sources, the limits and a
citation. Constituents and reporters can hand it to a representative, and it is
the cheapest advertising unit the project has.

**What exists.** The same records as the place pages and the receipt renderer.
The harvest-and-fire chart draws on a canvas client-side. There is no PDF
library and the plan allows none without need.

**Design.**

1. No new dependency: build the one-pager as a print-styled HTML route,
   `/en/.../print` and the French pair, with a `@page` stylesheet for Letter
   and A4, and let the browser's "Save as PDF" produce the file. A "Print or
   save as PDF" button triggers `window.print()`. This keeps the content
   identical to the page, in both languages, and avoids a server renderer.
2. Layout: header with the receipt image's facts in text; one panel with the
   riding figure and coverage; one with the province harvest-and-fire chart as
   an inline SVG (the chart builder already has the series; render it as SVG
   on the server for print); a sources and licence block; the QR code to the
   page URL drawn as an inline SVG from a small, tested encoder written in the
   repository (QR encoding is about 300 lines; still, confirm the owner prefers
   that over a plain URL, which is acceptable).
3. The neutral-language rules apply: no ranking position on the sheet, no
   colour scale, the measurement stated as "detected loss as a share of mapped
   forest".
4. Representative names are not printed. The sheet is about the riding, not the
   person, and the plan forbids implying responsibility from a boundary.

**Files.** `app/en/<riding route>/print/page.tsx` and French pair,
`components/places/RidingSheet.tsx`, a server-side SVG chart in
`components/transparency/` reusing the series loader, print stylesheet,
strings.

**Rules and decisions.** Whether to include a QR code. Whether provincial
ridings get sheets in the first version (their figures exist).

**Verification.** A Playwright test that prints the route to PDF with Chromium
and checks the page count is one for Letter; parity; accessibility contract;
claim-template gate for prohibited superlatives.

---

## 3. Embedded figures

**Goal.** A newsroom or municipal site embeds one place's figure with the
evidence label, coverage and attribution locked in, and it updates when a
release lands.

**What exists.** CSP sets `frame-ancestors 'none'`, so nothing can be framed
today; `X-Frame-Options: DENY` likewise. The place records and the receipt
renderer.

**Design.**

1. A dedicated embed route, `/en/embed/<place>` and the French pair, that
   renders only the figure card: name, figure or Unknown statement, coverage,
   span, evidence class, data version, attribution line and a link back. No
   navigation, no scripts beyond a resize message, and no analytics beyond the
   existing server logs.
2. Headers for that route only: `frame-ancestors *` (or a list, if the owner
   wants to allow only named domains) and no `X-Frame-Options`; every other
   route keeps `DENY`. Implemented in `proxy.ts` where headers are set.
3. An oEmbed endpoint, `/api/oembed?url=...`, returning the iframe HTML, so
   WordPress and other CMSs auto-embed a pasted place URL. oEmbed discovery
   links in the place page head.
4. A "Embed this figure" block on each place page with the iframe snippet and
   the terms: the embed may not be cropped to remove the attribution or the
   Unknown line, and it carries the licence line of its sources.
5. Versioning: the embed carries the data version in a visible stamp and in a
   `data-version` attribute, so a screenshot of it dates itself.

**Files.** `app/en/embed/[...]`, French pair, `app/api/oembed/route.ts`,
`proxy.ts` header rule with a test, `components/places/EmbedCard.tsx` and
`EmbedSnippet.tsx`, strings, `docs/THREAT_MODEL.md` note on clickjacking (the
embed has no interactive controls except the link, which is the mitigation).

**Rules and decisions.** The terms page gains an embed clause in both languages;
the owner approves the wording. Whether to restrict `frame-ancestors` to an
allow-list or open it. Depends on real place pages and on the receipt renderer
for a consistent look.

**Verification.** Header tests for both route classes; a Playwright test that
frames the embed route from a different origin and that a normal route refuses;
parity; the accessibility contract (the card has a title and the link has a
name).

---

## Suggested build order

1. **#4 Within 10 km of me** first: small, no decisions, reuses three existing
   endpoints, and gives the home page a resident-facing entry point.
2. **#1 Receipts** as soon as the real place pages land, because #2 and #3
   reuse its renderer and the same facts list.
3. **#2 One-pagers** and **#3 Embeds** next, in either order; both are place
   page children.
4. **#7 Time-lapse** in parallel with 2 and 3; it touches only Explore and is
   lazy loaded.
5. **#9 Reproduce it yourself** when the owner has the Zenodo account; the
   script and notebook can be built before the DOI exists.
6. **#5 The Unknown Atlas** after the owner decides what blocked-source facts
   are public.
7. **#10 Mill closures** last, after the plan amendment and legal review it
   needs.

## What this plan does not do

It does not open the accounts, alerts or live-wildfire gates, does not change
any published figure, and does not claim a professional French review. Each
feature's French ships as a draft for the owner's review, marked as such in
`docs/IMPLEMENTATION_STATUS.md`, until the external bilingual gate closes.
