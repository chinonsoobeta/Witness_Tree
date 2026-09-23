# Release-readiness pass, 2026-09-23

A pass over every public page in English and French, looking for anything wrong, inconsistent or unfinished before release. It covers the branch `claude/witness-tree-text-simplify-ynxsep`, which also carries the redesign (top-of-page note, evidence key, search suggestions, tiles, Explore layout and map legend).

This record says what was checked, what was fixed, what was left for the owner and why, and which release gates no code change can close. It does not close any gate in [external gates](EXTERNAL_GATES.md).

## What was checked

All checks ran against a local production build (`npm run build`, then `npm run start -- --port 4173`).

| Check | Scope | Result |
| --- | --- | --- |
| Link crawl | 867 pages reached from every route in both languages, including search, compare and Explore variants | Every internal link returns 200. The only non-200 responses are the two deliberate 404 probes. |
| Page structure | Same 867 pages | One `h1` per page, correct `lang`, a `<title>` on every page, no duplicate `id`s, every in-page `#` link resolves, every image has `alt` |
| Automated accessibility (axe-core 4, WCAG rules) | 43 routes; desktop light, desktop dark, phone light | No violations after the fixes below. Before them: `landmark-unique` on Compare and Explore. |
| Phone layout (375 px) | 43 routes | No horizontal page scroll and no element past the viewport edge |
| Script errors | 43 routes, 3 views each | None, apart from the 404 page's expected resource error |
| Rendered-text scan | 867 pages | Searched for `undefined`, `NaN`, `null`, `[object`, placeholders, the retired list view, "observed", "change" as the measure, English left on French pages. Findings below. |
| Visual review | Desktop screenshots of each page type, phone screenshots of Explore | Findings below |

The rendered-text scan and the visual review are the author's judgement, not an audit. Automated axe checks are not the independent accessibility audit the release gates require.

## Fixed on this branch

- **Vocabulary.** Compare said "Detected change" and "Detected change share", and Methods said "a detected change", for the same forest-loss figures Explore calls "detected loss". The product's own rule (`lib/domain/loss-vocabulary.ts`: "Loss, not change") says the data has no gain product. Both pages now say "detected loss" / "perte détectée". The ranking, its sort and its figures are unchanged.
- **French page titles.** Every French page's browser title ended in "· Witness Tree". It now ends in "· Arbre témoin", and French pages carry the French description and social-card text. The gateway title was "Witness Tree · Witness Tree"; it is now "Witness Tree / Arbre témoin".
- **Search results.**
  - Federal ridings were labelled "CA · Riding". They now say "Federal riding · QC" (or the right province), as the suggestions do.
  - A riding with no figure showed its unknown share beside the satellite mark. It now uses the unknown mark.
  - The French province note read "Ici, il s'agit d'un surtout dans le Grand Nord…". It now reads "Ici, l'écart se trouve surtout dans le Grand Nord…".
- **Home.** The exact province figure under each row said "ha recorded" / "ha consignés", which reads as an official record. It is a satellite detection, so it now says "ha detected" / "ha détectés". The English word "Unknown" was hard-coded in the same component for French pages; it is now localized.
- **Releases.** The CSV and GeoPackage downloads were plain arrow tiles; they now use the file tiles the Data page uses.
- **Component gallery.** Its sample "12.5 ha, Official record" figure carried made-up provenance ("National baseline record, version 2026.1") with nothing saying it was a sample. The section is now headed "Example values (made up, not records)" and the source is named "Example record".
- **Accessibility.**
  - Compare wrapped each table in a section with the same name as the table's scroll region, which made two landmarks with one name.
  - Explore's map section heading "Map" matched MapLibre's own canvas label. It is now "Map and legend" / "Carte et légende".
- **Layout.**
  - In the riding ranking, the unit "ha" wrapped onto its own line.
  - Year ranges wrapped in the harvest comparison table.
  - The line after the wildfire agency list sat flush against the last card.
- **Map error text.** It pointed readers to "the list and table"; the list view was retired, so it now says "the table below".

## Left for the owner, with reasons

These are real inconsistencies or open questions, but each is owner copy, legally reviewed text, or a product decision, so it was not changed here.

1. **About page is a placeholder.** It says "The owner hasn't written this page yet." A public release needs this page: who runs the site, why, and how to reach them.
2. **Terms and Privacy titles carry status words.** "Terms and limitations – reviewed" and "Privacy notice – pre-activation" read as internal states. Both are in the legally signed-off text, so any change needs the owner's legal scope.
3. **Terms uses "change".** "A change seen by satellite doesn't show its cause." It is signed-off legal text; "loss" would match the rest of the site.
4. **"Phase 2" in public copy.** Data, Releases and the harvest comparison say "not the formal Phase 2 release". Readers don't know what Phase 2 is. Tests pin this wording deliberately, so it needs an owner decision.
5. **"Other provinces are coming soon."** Home promises coverage that no record backs yet. A test pins it as deliberate. "Other provinces are not covered yet" would claim nothing.
6. **Province codes in French.** Tables, filters and the footer use BC, AB, ON and QC in both languages. French convention is C.-B., Alb., Ont. and Qc. This belongs in the professional French review (gate below) rather than a piecemeal change.
7. **Two evidence-mark styles.** Compare, place pages and the gallery use the older boxed evidence chips. Explore, search and home use the newer round marks. Both are labelled and accessible, but they look different.
8. **Compare is one very long page.** The full ranking of all ridings renders on one page (about 26,000 px tall on desktop). It works, but paging or a "show more" would be kinder.
9. **404 page title.** It shows only the product name, because this framework applies no route title to a not-found page. Adding a second `<title>` produced two titles, so it was not done.
10. **Explore province hover.** The approved design showed a tooltip when pointing at a province. It was not built; the reading panel beside the map carries the same figures.
11. **Account page wording.** It says alerts will give the "time observed". It is about wildfire agency data rather than a loss figure, so it was left.

## Release gates no code can close

From [external gates](EXTERNAL_GATES.md) and [implementation status](IMPLEMENTATION_STATUS.md), as they stand today. None is closed by this branch.

| Gate | What is needed | State |
| --- | --- | --- |
| Professional bilingual review | Professional French translation and terminology review, French usability testing, zero critical French defects | Not done. All French on the site, including every string added or changed on this branch, is unreviewed. |
| Independent accessibility audit | External WCAG 2.2 AA and EN 301 549 audit with assistive-technology testing | Not done. The automated checks above are not an audit. |
| Legal scope for changed copy | The recorded Phase 0 sign-off covers the disclaimers, terms and privacy text as written | This branch changes no terms or privacy text. It changes Methods and Compare labels from "change" to "loss". Decide whether that needs a scoped re-review. |
| Source rights and licences | Per-source licence, attribution and redistribution approval before release | Incomplete for anything beyond the bounded four-province preview |
| Indigenous engagement and right of reply | Contact register, briefing offer, named and tested reply route before any reserve or treaty page | Open. No such pages ship, and the site says so. |
| Domain and trademark review | Broader professional name-confusion review | Open |
| About page content | Owner-written page | Open (see above) |
| Security review and load test | Independent review and a 50-times-normal-traffic CDN test | Not started |
| Operations | Staffed, tested on-call rota; observability; backups | Not complete |
| Public beta, source-agency confirmation, launch decision | Invited beta, correction metrics, one source agency confirming its data, a recorded go/no-go | Not started |

## Deployment dependency

`components/explore/ExploreMapClient.tsx` changed, so the deployed-map render gate fails until this client is deployed and observed. Several checksum-bound evidence records also bind files this branch changed. The steps are in [the Codex redeploy instructions](../CODEX_REDEPLOY_INSTRUCTIONS.md): rebind with a dated note per claim, deploy, observe, settle the gate, then merge.
