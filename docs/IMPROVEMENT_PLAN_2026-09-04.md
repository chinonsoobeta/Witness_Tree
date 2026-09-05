# Witness Tree improvement plan, 2026-09-04

Twenty tasks: ten engineering, ten user interface. Every task below is grounded in
evidence gathered on 2026-09-04 against the deployed Site and the working tree at
`wt/premises-wave6` (`2db9640`). Speculative items were excluded.

## Standing constraints that bound every task

These are not suggestions. A change that violates one of them is a defect even if CI is green.

1. **Do not invent evidence.** Never record human review, external audit, source rights,
   approval, retention, ingestion, or recovery that did not actually occur.
2. **Owner authorization is not proof an event happened.** The owner authorizing a class of
   action does not let a formal evidence gate pass unless the required event occurred.
3. **Never weaken, narrow, or remove a checker to make CI green.** If a gate fails, either fix
   the cause or record the failure honestly.
4. **Unknown is never zero.** Coverage that is partial must stay labelled partial.
5. **Unavailable evidence is not contradicted evidence.** A check that cannot run without the
   external SSD must report `unavailable`, never `passed`.
6. **All project data stays on the external SSD.** It is currently the only copy. Use
   non-destructive operations only.
7. **No U+2014 em dash anywhere.** En dash is correct for numeric ranges (1984–2022) and for
   missing-value cells.
8. Checksum bindings may be refreshed only after confirming the bound criterion's stated reason
   still holds and the gate count is unchanged. Audit every downstream status record afterwards.

## Context: the widening workstream is underway

The four-province cumulative 1984–2022 zonal run completed on 2026-09-04 (BC 205.6s, AB 128.1s,
ON 249.2s, QC 287.7s, run concurrently). The merged artifact is on the SSD at
`derived/phase2-cumulative-province-zonal-v1/cumulative-province-zonal-1984-2022.json`,
sha256 `b165730ef3d219d4d3a7844cf8ac429dc3dbbe5a793e128aaf5db0e784d9e115`.

| Province | Cumulative observed loss (ha) | % of known 1984 forest | Repeat-loss area (ha) | Max loss events in one cell |
| --- | ---: | ---: | ---: | ---: |
| BC | 10,823,352.93 | 19.568120 | 409,526.55 | 15 |
| AB | 6,842,768.76 | 27.520175 | 809,081.82 | 17 |
| ON | 9,280,647.27 | 19.071954 | 317,270.52 | 14 |
| QC | 18,028,529.19 | 25.972551 | 582,650.37 | 14 |

Every row is `coverageGrade: partial-with-unknown`. The artifact is **not admitted, not released,
and not production eligible**.

### The constraint that governs every Explore change

Two artifacts describe this forest and they do not share a denominator.

- The **annual series** (`phase2-annual-province-zonal-v2`, 88,613 bytes, sha256 `65b51ab9…`,
  152 interval rows plus 4 baselines) measures each interval against **its own from-year forest
  mask**. BC alone has **38 distinct denominators**, from 55,311,152 to 58,061,631 ha, because
  the mask grows as forest regrows.
- The **cumulative row** measures a per-cell **union** against the **fixed 1984 mask**.

The consequence is not cosmetic. Summing BC's 38 intervals gives **14,920,559.37 ha**; the
cumulative union is **10,823,352.93 ha**. A reader who adds up the chart lands **4,097,206.44 ha**
away from the headline, for two separate reasons: overlapping cells counted once versus once per
interval, and the moving denominator admitting forest that regrew after 1984.

**No surface may present the interval rows as components that sum to the cumulative figure.**
Every percentage must travel with its basis. This is enforced by
`scripts/check-phase2-province-series.mjs`, which fails if the bases collapse, if the stated
difference stops matching its own figures, if either cause goes unstated, or if the union ever
exceeds the sum.

A related naming hazard was corrected on the way in. The store field `naiveAnnualSumHectares`
(11,715,123.15 for BC) is **not** the sum of the published annual series; it is the naive sum
restricted to 1984-forest cells. Store artifacts are run output and are never rewritten, so the
readback layer exposes it as `naiveSumOver1984ForestHectares` with the original name recorded
beside it.

### Division of labour

Six tasks moved out of the Codex backlog into the widening workstream, because doing the widening
without them would create the exact defects they describe.

| Task | Why it moved |
| --- | --- |
| U6 period single-source | Widening otherwise hand-edits the period string in six places |
| U10 date-range formatter | Widening otherwise writes dozens of new date strings in three formats |
| U5 cumulative headline | It is the widening's own presentation surface |
| E6 `totals.hectares` rename | Same naming hazard, same layer, resolved in the readback |
| U1 mobile overflow | The headline would land on a page that overflows on phones |
| E4 map-gate circularity | A new PMTiles release hits the circular gate head-on |

**Codex scope is therefore the remaining fourteen tasks:** E1, E2, E3, E5, E7, E8, E9, E10, and
U2, U3, U4, U7, U8, U9.

### Widening progress as of this revision

Complete and green:

- `scripts/build-phase2-province-series-readback.mjs` → `data/phase2-province-series-readback.json`
  (51,512 bytes), binding both store artifacts by digest and cross-validating them: the annual
  artifact matches the digest its receipt binds, the coverage fields agree between the annual
  baseline and the cumulative row, the 1984 denominator agrees across all three sources, and the
  union never exceeds the naive sum.
- `scripts/build-phase2-province-series.mjs` → `data/phase2-province-series.json` (38,965 bytes),
  the lean record the application imports, bound to the readback by digest.
- `scripts/check-phase2-province-series.mjs` and `tests/phase2-province-series.test.mjs`
  (8 tests, all passing), registered as `check:phase2-province-series` in `package.json` and in
  `.github/workflows/ci.yml`, and accepted by `check:ci-check-coverage`.

Remaining in the widening workstream: the `lib/explore` module, U1, U6, U10, the Explore surfaces
including U5, the 1984–2022 bulk download release, per-interval tile generation with E4, French
copy, documentation updates, and the owner admission packet.

---

# Part one: ten engineering tasks

## E1. Outage detection: the uptime workflow cannot detect an outage

**Evidence.** `.github/workflows/synthetic-uptime.yml` runs `cron: "0 */6 * * *"` and has **no
alerting step of any kind**. It uploads an artifact and stops. On 2026-09-04 the Site was fully
down for 34 minutes (07:44 to 08:18:01 PDT, dispatch-layer 404 on every route) and nothing fired.
A six-hour poll can miss an outage of that length entirely.

**Fix.** Reduce cadence to every 15 minutes. Add a failure step that opens or updates a single
deduplicated GitHub issue with the failing route, status code, and timestamp, and closes it on
recovery. Track consecutive failures so one transient blip does not page.

**Gate.** New `scripts/check-uptime-alerting.mjs` asserting the workflow has a failure-path
alert step and a cadence no slower than 15 minutes. This gate checks **workflow configuration**.

**Boundary.** Do **not** flip `siteTier.monitored`, `claims.syntheticRunObserved`, or
`claims.hostTierMonitored` in `data/observability-deployment.json`. Those record observed host
-tier facts. Configuring an alert is not observing a run.

## E2. The uptime script is undiscoverable and has no help

**Evidence.** `scripts/run-synthetic-uptime.mjs` has no `package.json` script. Invoking it
produced `--origin is required`, then after fixing that, `--output is required`. The flags are
discoverable only by reading the source.

**Fix.** Add `verify:synthetic-uptime` to `package.json` with the standard origin and output
defaults, and a `--help` that prints all flags including `--record`.

## E3. Route payloads are dominated by uncacheable inline script

**Evidence, measured from the deployed Site.** `/en/explore` is 269,784 bytes, of which
244,742 bytes (91 percent) is inline script across 39 separate `<script>` tags. `/en/compare` is
552,331 bytes. Inline script is re-sent on every navigation and cannot be cached separately.

**Fix.** Move serialized data payloads out of the document into external, content-hashed JSON
fetched during hydration. Keep only the hydration bootstrap inline.

**Gate.** `scripts/check-payload-budget.mjs` with per-route byte ceilings taken from a real
build, failing on regression. Set ceilings from measured post-fix values, not aspirations.

**Sequencing constraint.** The widening adds a cumulative headline and 38 intervals of province
data to Explore. Measure the ceilings **after** the widening lands, or the budget locks in a
number the widening immediately breaks.

## E4. The deployed-map-render gate is circular (moved to the widening workstream)

**Evidence.** `check:deployed-map-render` blocks any map-client pull request until the branch is
itself deployed. A map fix therefore cannot merge without being deployed and cannot be deployed
without merging. PR #134 broke the circle once, by hand.

**Fix.** Let the gate accept a preview or branch deployment URL, so a branch can satisfy it
before merge. If no preview URL exists, provide an explicit break-glass path that **records the
reason in an evidence artifact**, following the #134 precedent, instead of relying on an
undocumented ad-hoc decision each time.

**Boundary.** Break-glass must record a reason, not suppress the gate.

**Status, 2026-09-04.** Implemented. The gate now resolves across three tiers, documented in
[docs/DEPLOYED_MAP_RENDER_GATE.md](DEPLOYED_MAP_RENDER_GATE.md). The harness labels a record by
the origin it measured rather than the path it is written to, so a preview run cannot be filed as
a Site observation. A preview record must name a real remote https origin and the revision it was
built from. A break-glass record carries a written reason, an authorizer, the exact digests it
covers, and a settle-by date at most 14 days out; it expires, it cannot be reused for a later
change, and it fails the gate once the Site observation is current again. Neither weaker record is
committed on this branch, and a test asserts that, so the gate here is still the strong one.

## E5. Data-root-bound checks report skips indistinguishably from passes

**Evidence.** `scripts/lib/data-root-bound-tests.mjs` marks 19 of 157 checks as requiring the
external SSD. The detached baseline is 138 runnable and 19 unavailable. CI has no SSD, so those
19 can never run there, and a plain skip reads as success.

**Fix.** Emit a machine-readable `unavailable` status distinct from `passed` and from `failed`.
Add `scripts/check-data-root-coverage.mjs` asserting the 138/19 split has not drifted silently,
so a check cannot be quietly moved into the unavailable bucket to dodge a failure.

## E6. `totals.hectares` is a naive sum and will be published by accident (done in the widening workstream)

**Evidence.** `data/phase2-per-cell-annual-series.json` carries `totals.hectares` =
124,562,467.53, a naive sum across 38 intervals, which double counts every cell disturbed more
than once. It is **not currently rendered anywhere**, so there is no live defect today. It is a
loaded gun: the field name invites exactly the wrong use, and the correct union figure now exists.

**Fix.** Rename to `naiveIntervalSumHectares`, add a sibling `doNotPublish: true` and a note
pointing at the cumulative artifact. Add a check that fails if any component or route imports the
field. Update the builder and its test together.

## E7. No automated accessibility gate

**Evidence.** Phase 8 lists `external-accessibility-audit` as failing, and there is no automated
coverage standing in for it in the interim.

**Fix.** Add `axe-core` to the Playwright suite across all six routes, in both themes and both
locales, failing on any WCAG 2.2 AA violation. Record results as an evidence artifact.

**Boundary.** This does **not** close the Phase 8 `external-accessibility-audit` criterion, which
requires a real external auditor. Do not change that criterion's status or the completed count.

## E8. No load-testing harness

**Evidence.** Phase 8 `load-testing` is failing with no local implementation.

**Fix.** Add a k6 or autocannon scenario with a documented request budget, recording p50, p95,
p99 and error rate to an evidence artifact.

**Boundary.** It must default to a local or preview target. Running it against the production
origin requires explicit owner authorization at the time of the run, recorded in the artifact.
Do not run a load test against production as part of implementing this task.

## E9. No threat model and no automated security scanning

**Evidence.** Phase 8 `security-review` is failing. There is no dependency, secret, or static
analysis gate in CI.

**Fix.** Add CodeQL, a `npm audit --omit=dev` gate, and gitleaks. Write `docs/THREAT_MODEL.md`
covering three trust boundaries specifically: the ChatGPT Sites control plane (deploys are
control-plane only; merging to main does not update the live site), the public PMTiles and
GeoJSON artifacts, and the SSD data root.

**Boundary.** Automated scanning is not the external security review. Do not close that criterion.
Never expose Site source credentials or bypass tokens in code, logs, or artifacts.

## E10. The only copy of the project data has no integrity manifest

**Evidence.** The internal copy was deleted on 2026-08-26 and no backup exists. The SSD is the
sole copy. Phase 8 `backups` is failing.

**Fix.** Add `scripts/verify-data-root-inventory.mjs`, strictly read-only, producing a checksummed
manifest of the SSD tree so that corruption or loss becomes **detectable**. Document the recovery
position honestly in `docs/`.

**Boundary.** A manifest is detection, not backup. Do **not** record that backups exist, and do
not close the `backups` criterion. Never write to, move, or delete anything under the data root.

---

# Part two: ten user interface tasks

All UI findings below were measured live at 375x812 and 1280 viewports on the deployed Site on
2026-09-04. Desktop at 1280 was clean: no overflow, no unnamed buttons, no positive tabindex, no
missing alt text, one `h1` per page, skip link present.

## U1. The Explore page scrolls sideways on a phone (moved to the widening workstream)

**Evidence.** At a 375px viewport, `/en/explore` has `scrollWidth` 1000 against `clientWidth` 375.
The document itself scrolls horizontally. Chain: `main.page-wrap` correctly shrinks to 335px, but
an unclassed `section` inside it computes to 980px, dragging `div.explore-map`, the `h2`, the
`legend`, and body paragraphs to 980px with it.

**Root cause, confirmed.** The fallback SVG map contains a `rect` whose computed width is
`1000px`. The SVG has no responsive clamp, so its intrinsic width becomes the grid column's
min-content floor. `.explore-section` is `display: grid` with no `grid-template-columns`, so its
implicit column is `auto` and cannot shrink below that floor. Neither `.explore-map`
(`min-width: 0`) nor `.segment-set` sets a width; they are victims, not causes.

**Fix.** Give the fallback SVG a `viewBox` plus `max-width: 100%; height: auto`. Add
`min-width: 0` to the grid and flex items in the Explore chain. Do not chase this with
`overflow: hidden` on an ancestor, which would hide the symptom and clip the map.

**Gate.** Playwright assertion that `documentElement.scrollWidth <= clientWidth + 1` on all six
routes at 375, 768 and 1280.

**Note on scope.** I reached the fallback because the PMTiles layer did not initialize in the
automation pane. Per project doctrine, the hidden pane throttles timers and produces false map
failures, so **do not treat that as a production PMTiles defect** and do not "fix" PMTiles on the
strength of it. The fallback overflow is real and is what any user on the fallback path sees.

## U2. A four-column definition list does not collapse on mobile

**Evidence.** A `dl` computes to `grid-template-columns: 216.5px 216.5px 216.5px 216.5px`, total
938px, inside a 335px column.

**Fix.** `grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr))`. The
`min(100%, ...)` form is required; a bare `minmax(12rem, 1fr)` overflows below 12rem.

## U3. The data table is not scroll-contained

**Evidence.** `th` and `td` compute to 492.023px each on a 335px column.

**Fix.** Wrap the table in an `overflow-x: auto` container with `tabindex="0"`, an accessible
name, and a visible focus ring, so keyboard users can reach and scroll it.

## U4. Eleven text elements render below 12px on mobile

**Evidence.** A live audit at 375px counted 11 elements with a computed font size under 12px.

**Fix.** Raise the small end of the type scale so no body-adjacent text falls below 12px, 14px
preferred. Fix the scale rather than patching individual rules.

## U5. The site's most important number has nowhere to live (moved to the widening workstream)

**Evidence.** The cumulative 1984–2022 union figure now exists (BC 10,823,352.93 ha, 19.568120
percent of known 1984 forest) and the interface has no element that can express it. The stated
product goal is a cumulative headline.

**Fix.** Design a headline block carrying the union figure, the year range, and the coverage
caveat in the same visual unit, so the number is never separable from its limits. Show the
`partial-with-unknown` grade as part of the headline, not as a footnote.

**Boundary.** Build the component and wire it to the artifact shape, but **do not publish the
cumulative figures** until the owner admission packet exists. The artifact is currently
`admitted: false, released: false, productionEligible: false`. Ship the component behind whatever
gating the repo already uses for unadmitted data.

## U6. The "2020 to 2022" period string is hardcoded in at least six places (moved to the widening workstream)

**Evidence.** `components/explore/ExploreMapClient.tsx` lines 40, 48, 100 and a comment at 500;
`components/explore/ExploreView.tsx` lines 45 and 47. `lib/explore/map-style.ts` holds the
authoritative `period: "2020-2022"` field, which the copy does not read.

**Fix.** Derive the period label and the coverage sentence from the artifact's `period` field
through one shared module. When the aggregate widens, exactly one value changes.

## U7. The map legend and layer list overflow their panel

**Evidence.** `ul.explore-map-layer-list` and `ul.explore-map-legend` each compute to 403.117px
inside a 335px column.

**Fix.** Allow wrapping and let the items size to content.

## U8. The province bar overflows on mobile

**Evidence.** `nav.province-bar--map` computes to 563.656px at a 375px viewport.

**Fix.** Horizontal scroll with scroll snap and visible edge affordance, or wrap to two rows.
Keep the whole strip keyboard reachable either way.

## U9. The fallback status message is a dead end

**Evidence.** The status paragraph reads "The interactive PMTiles layer did not begin...", which
tells the user a subsystem name and no action.

**Fix.** Say what is still true and what they can do: the static map is shown, the figures below
are unaffected, and offer a retry control. Name things the reader recognizes, not the subsystem.

## U10. Date ranges are formatted three different ways (moved to the widening workstream)

**Evidence.** The table caption reads "Forest loss map: 2020-2022" with a hyphen, body copy reads
"2020 to 2022", and elsewhere the en dash form "2020–2022" appears.

**Fix.** One date-range formatting helper used everywhere. En dash for numeric ranges. Never a
U+2014 em dash. Apply to both EN and FR copy.

---

## Suggested sequencing for the Codex scope

The widening workstream runs separately and owns U1, U5, U6, U10, E6 and E4.

1. **E1, E2** first. Detection before optimization: a 34-minute outage went unnoticed on 2026-09-04.
2. **U2, U3, U4, U7, U8** as one responsive pass, verified at 375, 768 and 1280. Coordinate with
   the widening workstream, which is changing U1 in the same stylesheet.
3. **E5**, then **E3** once the widening has landed and the ceilings can be measured honestly.
4. **E7, E9, E10** as gates, each with its Phase 8 boundary respected.
5. **U9**.
6. **E8** last, since running it against production needs owner authorization at the time.

## What must not change

- The eight failing Phase 8 criteria stay failing until the real external events occur:
  professional bilingual review, external accessibility audit, security review, load testing,
  legal licence and attribution review, on-call rota, observability, backups. The completed count
  stays 8 of 16, 50 percent, unless a genuine event moves it.
- `data/phase2-admission-record-2026-08-26.json` scope is the 2020–2022 province aggregate.
  Widening the published period requires a new owner decision, not an edit to that record.
- `scripts/phase2_annual_zonal_aggregate_v2.py` is frozen; its sha256 is checksum-bound.
- The interval basis and the cumulative basis stay separate and stay explained. No surface may
  sum the interval rows into the cumulative figure, and no percentage may appear without its
  denominator's basis beside it.
