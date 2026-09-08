# Witness Tree redesign: implementation plan

Source: Claude Design project `5c3e9528-723c-4f37-8e47-1f2c6aeaa15b`, "UI mockups request",
four turns, read in full on 2026-09-08. Selected pattern: direction **1c, "Confidence first"**.

Base branch: `wt/premises-work`, cleared 2026-09-08 at `37da16d`.
Work branch for this plan: `redesign/confidence-first`, cut from `wt/premises-work`.

## 0. Status of the preconditions

| Precondition | State |
|---|---|
| Base branch green | Done. 117 of 119 verify steps pass; 1490 of 1491 tests pass. |
| Remaining red | `check:deployed-map-render` and the one test it backs. Structural, see C4. |
| PR #148 | Merged into `wt/premises-work` at `6d417a8`. |
| Design-system bundle (PR #147) | Still open against main. See section 7. |

The two red items are one root cause and cannot be closed from a feature branch. Treat that
single failure as the branch's known floor, and read any second failure as new.

## 1. The three decisions, resolved

**D1. TopBar, and it is a restyle rather than a new component.**

The mockup's `TopBar.dc.html` and the repo's `components/site/SiteHeader.tsx` already have the
same structure: wordmark linking to the locale root, five nav items whose labels match exactly
(Explore/Compare/Methods/Data/Search, Explorer/Comparer/Méthodes/Données/Recherche), a locale
anchor, a theme toggle, and a `<details>` disclosure labelled Menu for the narrow layout. The
mockup's three variants (`full`, `compact`, `mobile`) are the states that disclosure already has.

So adopting TopBar changes the styling and the touch targets, not the component tree. Nothing is
duplicated, the header stays a server component, and the shared client bundle is untouched. The
divergence from the synced design system is a visual one, which is what the brief intended.

**The trap this hides.** The mockup's bar is `#2c2c24` filled with `#fdfcf8` ink. Those are
exactly `--ink` and `--ground` in the light palette, so the obvious implementation is
`background: var(--ink); color: var(--ground)`. That is wrong. The dark palette swaps them
(`--ground: #16130f`, `--ink: #f2ede3`), so in dark theme the bar would render near-white with
near-black text: the inverse of the design, and a contrast failure against the page beneath it.

The bar is a surface that stays dark in both themes, so it needs its own tokens, declared in all
three palette blocks with values that do not flip:

| New token | Light | Dark | Role |
|---|---|---|---|
| `--topbar-fill` | `#2c2c24` | `#22201a` | bar background |
| `--topbar-ink` | `#fdfcf8` | `#f2ede3` | wordmark and active item |
| `--topbar-ink-2` | `#ded8cf` | `#c9c2b6` | inactive nav items |
| `--topbar-accent` | `#a9cf9b` | `#a9cf9b` | active underline |
| `--topbar-edge` | `#948b7a` | `#7d7566` | theme-button and control edges |

`#a9cf9b` is the one mockup colour with no existing token. It is close to the dark palette's
`--accent` (`#9cbe8c`), which is consistent: the underline sits on a dark ground in both themes,
so it takes a dark-ground accent in both.

Every other mockup hex resolves to a token already declared: `#2c2c24` → `--ink`,
`#fdfcf8` → `--ground`, `#ded8cf` → `--rule`, `#948b7a` → `--rule-strong`, `#e6dccd` → `--sand`,
`#47593f` → `--accent`. Reuse those names in page content; use the `--topbar-*` quartet only
inside the bar.

**D2. The photographs are the owner's own, and carry no attribution or licence statement.**

They were taken by the owner and found by searching "forest" in their Photos app. The owner has
stated that no attribution or licence line is required. This is the one asset step Codex cannot
perform: the file must be exported and committed by the owner.

- Path: `public/gate/forest.jpg`, with `public/gate/forest.avif` and `.webp` alongside if the
  export tooling produces them.
- Long edge 2400px, quality tuned to stay under 400 KB for the JPEG.
- No `<figcaption>`, no source line, no entry in the sources register. The gate is chrome, not
  evidence, and adding it to the sources register would assert a provenance claim about a
  decorative image.
- The gate must still render correctly with the file absent, falling back to `--ground` under the
  same 76% scrim, so the branch is never broken by a missing binary.
- `alt=""` and `role="presentation"`. It carries no information, and describing it would invite
  the reader to read it as evidence of a place.

**D3. 3c needs no engine work. Investigated 2026-09-08.**

`lib/shapes/measure.ts` already returns, for any user-drawn shape:

- `unionHectares`, `sumHectares` and `forestHectares` each as a `Bracket` of `{low, estimate, high}`,
  where `low` counts interior blocks only and `high` counts interior plus whole edge blocks, so the
  estimate never travels alone.
- `coverage.blocksWithoutData`, blocks the shape covers that the packed grid never carried, counted
  as absent rather than as zero. The file's own comment states the reason: "no forest was lost here"
  and "this was never measured" are different answers.
- `coverage.outsideGridHectares`, the part of the shape that falls on no grid block at all.
- `coverage.edgeShareOfEstimate` and `precision.exact`, which say how much of the middle number came
  from partial blocks.

`components/explore/ShapeMeasureClient.tsx` already renders all of it in both locales, including a
`between {low} and {high}` phrasing and prose explaining the 960 m block scaling.

So 3c is presentation only. Two things are missing, and both are layout:

1. The two unknown categories are rendered as conditional footnotes near the bottom
   (`precisionMissing`, `outsideGrid`), not as a plate at the top. 3c requires the screen to state
   that the shape crosses two coverage states *before* it shows the range.
2. The flow has no route of its own. It is mounted inside `app/en/explore/page.tsx` and
   `app/fr/explorer/page.tsx`. 3c gives it a screen.

Phase 6 is therefore unblocked and is the same size as the other screen phases.

## 2. What the mockups specify

One idea applied twelve times: **the screen states what it can and cannot tell you before it shows
a number.** Every screen gets:

- A **coverage statement** at the top. On a data screen it states the coverage caveat; on a screen
  with no numbers it states accountability instead.
- The **four evidence classes as a standing legend**, not a footnote. The repo already has the
  colours as `--edge-record`, `--edge-satellite`, `--edge-derived`, `--edge-unknown`.
- **Unknowns at the same visual weight as figures.** The load-bearing rule. On the landing page
  each province's unknown area gets its own bar beside its loss figure, because the province with
  the least loss is also the one with the largest unseen share.
- **Provenance reachable from the figure**, not trailing the page.
- Legend entries carry **a shape and a label, never colour alone**.
- Missing values render as `–` (U+2013) with a stated reason, never as 0.

The brief names four defects in the current place page that all three directions fixed: the record
identity scrolls away, coverage is a bare percentage list, the annual chart is a 300x140 SVG with
colliding labels, and citation and sources sit at the very bottom.

**Naming note.** `--plate` is already a token, and it is a width (`1180px`), not a colour or a
component. Name the new shared component `CoverageStatement`, not `CoveragePlate`, so a reader of
`globals.css` is not led to expect a surface.

## 3. Screen inventory

Twelve screens. The site is bilingual through a `locale` prop, so this is twelve components rather
than twenty-four.

| Mockup | Screen | Target |
|---|---|---|
| 1c | Place record, the anchor | `components/places/PlacePage.tsx` |
| 2a | Explore map | `components/explore/ExploreView.tsx`, `ExploreMapClient.tsx` |
| 2b | Search and address finder | `components/search/`, `app/*/search`, `app/*/location` |
| 2c | Data and sources | `app/*/data`, provenance rail at 460px |
| 2d | Methodology | `components/transparency/MethodologyPage.tsx` |
| 2e | Governance | `components/governance/`, `app/*/decisions` |
| 2f | Riding comparison | `components/comparison/` |
| 2g | Wildfire | `components/wildfire/` |
| 2h | Account status | `components/account/` |
| 3a | Language gate | `app/(gateway)/page.tsx` |
| 3b, 3f | Landing, both locales | `app/en/page.tsx`, `app/fr/page.tsx` |
| 3c | Draw and measure | `components/explore/ShapeMeasureClient.tsx`, new route |

3d and 3e are not screens. They are cross-cutting fixes found by rendering French at full label
length and dark theme on the risky panels, and they apply to every phase.

## 4. Constraints the gates impose

Fail-closed checks that will reject the work.

**C1. No raw colour.** `check:hex-literals` allows hex only inside the palette blocks of
`app/globals.css` matching
`/^(:root(:not\(\[data-theme="light"\]\))?|\[data-theme="(light|dark)"\])( \{|,)$/`.
`check:style-tokens` keeps raw colour out of TSX. 65 tokens are declared today. The mockups are
built entirely from inline hex. Land the token mapping in section 1 as the first commit, before
any component is written; guessing per screen produces drift the gate then rejects screen by screen.

**C2. Both themes, three states.** The palette is bare `:root`, then
`:root:not([data-theme="light"])` under `prefers-color-scheme: dark`, then `[data-theme="dark"]`.
Never give a colour its only definition inside a media or `[data-theme]` block. Turn 3e already
found two real bugs this way: the hatched unknown needed a lighter warp thread, and cards were
inheriting light-theme ink so the confidence label landed at 1.23:1. `check:contrast` enforces this.

**C3. French at full length is a layout input, not a translation step.** Turn 3d found two
structural breaks: the riding column head needs its coverage line on its own row rather than beside
the name, and the wildfire disclaimer heading wraps to two lines so its swatch moves to the top edge
instead of centring. Build every panel against the French string, not the English one.
`check:bilingual` enforces route pairs.

**C4. The map gate restales on every touch.** `check:deployed-map-render` fails whenever
`lib/explore/map-style.ts` or `components/explore/ExploreMapClient.tsx` differs from the state
observed on the deployed Site, and it explicitly refuses a preview origin: "preview origin proves
the code works, not that the Site does." Deploys are ChatGPT Sites control plane only, so this gate
closes only after the owner deploys and re-runs `npm run verify:deployed-map-render`. Never edit the
record by hand; the checker's own header says a hand-written record asserts a measurement that did
not happen. **Batch every map touch into phase 2 so one deploy closes all of them.**

**C5. Checksum-bound evidence.** The `phase3-frontend-foundation`, `phase7`, `phase8` and `phase9`
exit-status records bind sha256 of files this work will edit, including `ExploreView.tsx`,
`ExploreMapClient.tsx`, `RankedRidingsTable.tsx`, `SideBySideComparison.tsx`, `map-style.ts`,
`tests/explore.test.tsx` and `tests/comparison.test.tsx`. Each edit needs a doctrine-compliant
rebinding: re-read the bound criterion's stated reason, confirm it still holds against the new
content, confirm the gate count does not change, rebind, then audit downstream records. `phase9`
binds `data/phase8-launch-readiness-exit-status.json`, so phase 8 is always rebound before phase 9.

**C6. Claim language.** `check:claims` bans "unexplained", "unreported", "undocumented" and
"illegal" anywhere in `app/`, `components/` and `lib/`. `tests/transparency-pages.test.mjs` also
bans "real-time", "complete" and "truth". No em dash (U+2014) anywhere in the repo; `–` (U+2013) is
correct for numeric ranges and missing-value cells.

**C7. No figure moves.** `tests/transparency-pages.test.mjs` asserts the exact sequence of numerals
rendered on the methods page. Introducing a numeral into prose on a bound page breaks it. The
redesign changes order, weight and reachability, not values.

## 5. Phasing

Ordered so the pattern is proven once before it is repeated, and so map touches batch into one
deploy.

**Phase 0. Foundations.** The `--topbar-*` token quartet and the mapping table from section 1.
Two new shared components, `CoverageStatement` and `EvidenceLegend`, with unit tests covering both
locales and both themes. The TopBar restyle of `SiteHeader`, including the active-item underline,
the 40px and 44px minimum touch targets, and the three variants. No page content changes.
This is the phase that makes the other six cheap, and the one most likely to be skipped.

*Done when:* `check:hex-literals`, `check:style-tokens`, `check:contrast` and `check:bilingual` pass;
the two new components have tests; no page under `app/` has changed.

**Phase 1. Place record (1c).** The anchor. Pin the record identity so it does not scroll away,
put the headline figure in its own band, put the coverage statement first, move provenance off the
bottom into reach of the figure, and give the annual series room to breathe so its labels stop
colliding. Proves the pattern on the screen every other screen feeds into.

*Done when:* `PlacePage.tsx` and `AnnualChangeChart.tsx` render the pattern in both locales and both
themes; no published figure has changed; `check:claims` passes.

**Phase 2. Explore, Search and Draw (2a, 2b, 3c).** Every map touch, batched. Map caveat strip;
legend entries gain shape plus label; search's no-record result becomes a first-class result rather
than an empty state, because an address resolves to a boundary and a boundary may hold no record;
the draw-and-measure flow gets its own route and a coverage statement naming the two coverage states
before the range. Rebind phase 7 and phase 8 evidence.

*Done when:* everything above is green **except** `check:deployed-map-render`, which the owner
closes by deploying and re-running the harness. Do not start phase 3 before that deploy: a second
map-adjacent failure would be indistinguishable from the known one.

**Phase 3. Compare and Wildfire (2f, 2g).** The two screens the brief calls dangerous: two numbers
side by side invite a ranking, and wildfire is the one screen a reader might act on. Comparability
caveat in the statement; differing coverage marked in the column head, not a footnote; observation
time in the reader's own timezone. Carries the 3d and 3e fixes for these panels. Rebind phase 7.

**Phase 4. Data, Methods, Governance, Account (2c, 2d, 2e, 2h).** Lower risk. Provenance rail at
460px on Data; Methods at the 68ch measure (`--measure`) with confidence rules as a real table and
rule ids in mono; Governance carries accountability in place of coverage, with the correction path
as the primary action; Account drops the statement and keeps only the honesty about state.
Methods is bound by C7, so touch its prose without adding numerals.

**Phase 5. Entry points (3a, 3b, 3f).** The gate on the owner's photograph under a flat 76% scrim,
staying a true gate with no nav and no figures. Landing in both locales with each province's unknown
area at equal weight to its figure. Blocked on the owner committing `public/gate/forest.jpg`, but
the fallback in D2 means the code can land before the file does.

**Phase 6. Cross-cutting sweep (3d, 3e).** Re-render every touched panel at full French label
length and in dark theme, and fix what that finds. Not optional and not foldable into the other
phases: the two bugs turn 3e found were only visible once the panels existed.

## 6. Landing sequence

Each phase is its own pull request against `wt/premises-work`. None goes to main in this plan.
Phase 2 pauses for the owner's deploy before phase 3 begins.

## 7. Two dependencies worth stating plainly

**The mockups were built against a design-system bundle that is not merged.** PR #147 synced 37
components to project `2f6334e9-b96f-40bd-a7d4-0e3da2546b03` on branch `integration/2026-09-04`.
It targets main and is still open. Component APIs the mockups assume come from there. Where a
mockup uses a design-system component the repo does not have, prefer the repo's existing component
and note the divergence rather than vendoring a copy.

**The one gate that stays red is not this work's fault and is not this work's to close.**
`check:deployed-map-render` is a post-deploy observation. Never self-authorize a break-glass on
your own change.

## 8. What this plan does not include

- No change to any published figure. Order, weight and reachability only.
- No new claim about coverage, accuracy or provenance. Every number stays bound to its record.
- No merge to main.
- No new source, no ingestion, no deployment.
