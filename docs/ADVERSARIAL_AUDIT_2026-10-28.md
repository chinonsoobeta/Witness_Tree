# Adversarial audit of www.witnesstree.ca, 2026-10-28

Scope: the live site at www.witnesstree.ca (main at `0a01d183`), both locales, crawled with curl and a real browser at 1280×900 and 375×812. Each finding says how it was reproduced and what to do about it. Nothing here has been changed in the repository; this is a report for the owner to prioritise.

Three findings overlap with work already delegated today and are marked as such.

## Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| B1 | Explore silently discards bad `year`/`from` and shows 2021–2022 with no message | Medium | Open |
| B2 | Compare silently substitutes default places when `left`=`right` or an id is unknown | Medium | Open (picker delegated) |
| B3 | Explore rankings heading says "1984–2022" beside figures that follow the chosen span | Medium | Open |
| B4 | Play ignores the chosen first year, steps the span down to one year, and keeps advancing while the map is on its still-image fallback | Medium | Open |
| B5 | Explore map still "Loading the map layers" 10 s after load; falls to the still map at ~20 s with WebGL available; one console 404 | High | Delegated (`worktree-agent-a353931948505c9bd`) |
| B6 | Play/Pause button's accessible name appears not to change when it shows "Pause" | Low | Open (needs confirmation) |
| B7 | Search with a whitespace-only query shows "No released place… matches this query" instead of the empty-query prompt | Low | Open |
| B8 | Search "montreal" prints dozens of identical "Whole riding: Loss unknown; 100% of the forest is unknown" rows | Medium (UX) | Open |
| B9 | Compare rankings carry a column that is Unknown in every row, and say "36 of 280 federal ridings" without explaining 280 vs 343 | Low | Open |
| B10 | No cross-locale, case-insensitive or `/favicon.ico` handling: `/fr/explore`, `/en/explorer`, `/EN`, `/en/Explore`, `/favicon.ico` all 404 | Low | Open |
| B11 | Harvest-and-fire chart builder silently ignores invalid parameters | Low | Open |

What worked under hostile input: `q` is HTML-escaped; accent-insensitive search; nonsense queries give a proper Unknown state; the language switch keeps query parameters; hreflang alternates are correct; every CloudFront and GitHub download link returns 200; the French 404 page is French; every API route rejects wrong methods and missing parameters with 405/400; the theme radios work and persist (`localStorage` key `witness-tree-theme`); a skip link is the first focusable element; every `<img>` has `alt`; heading order on Explore is h1 → h2 → h3; the limit-bound APIs (shape measure: 250 vertices, 40 tiles, 60,000 blocks, 2,000,000 ha) refuse oversize input.

## Bugs

### B1. Explore ignores invalid years silently

**Reproduce.** `/en/explore?from=2022&year=1985` (first after last), `/en/explore?year=1900`, `/en/explore?year=abc`. Each renders the default 2021–2022 span with no message, and the bad URL stays in the address bar.

**Why it matters.** A shared link with a typo quietly shows different figures from what the sender meant. The plan's rule is that the reader always knows what span a figure covers.

**Fix.** In the Explore parameter parser (`lib/explore`), return a `corrected` flag alongside the resolved span. Render one line above the year controls: "The years in this link couldn't be read, so the record opens at 2021–2022." Replace the URL with the resolved parameters (`router.replace`) so copy-link is honest. Keep HTTP 200. Add a unit test per bad-input class. Same pattern for `mode`, `presentation` and `overlays`.

### B2. Compare substitutes defaults silently

**Reproduce.** `/en/compare?left=federal-59021&right=federal-59021` renders North Island—Powell River against Abbotsford—South Langley. `/en/compare?left=federal-35107&right=federal-59005` (ids that do not resolve) renders Thunder Bay—Rainy River against Chilliwack—Hope. No message in either case.

**Fix.** Validate both ids. Unknown id: keep the page, show "No place has the id `federal-35107`. Pick a place below." and leave that side empty. Same id on both sides: show the one place once with "Pick a different place for the other side." The typeahead picker delegated today (`worktree-agent-ac05c15b73f8d886d`) handles selection; this message logic is separate and small.

### B3. Rankings heading fixed to 1984–2022

**Reproduce.** `/en/explore` (default span 2021–2022). The readout reads "Four provinces · 2021–2022" while the rankings block reads "Ridings with the largest share of forest lost, 1984–2022". With `from=1984&year=2022` both say 1984–2022, which hides the mismatch in the common demo.

**Fix.** Either make the rankings follow the chosen span (the interval measurements in `data/phase3-riding-interval-measurements.json` already carry spans) or, if the ranking is whole-record only by design, title it "…over the whole record, 1984–2022 (not the years you chose)" so the two numbers are never read as the same span.

### B4. Play does not play the span the reader chose

**Reproduce.** Open `/en/explore`, click "Play through the years". The URL jumps to `year=1985&from=1984`, then `year=1986` with `from` dropped: the span collapses to one-year steps starting from 1984 regardless of what was set. Meanwhile the status line says "Loading riding figures for these years. They stay hidden until they arrive" and, after a few steps, "The interactive map is taking too long, so a still map is shown instead." Playback kept advancing (observed at year 2004 after about 25 s) while the map on screen was a still image and the riding figures were hidden.

**Fix.** Define what Play means and say it in the button label: "Play year by year from 1984". Hold the first year fixed at the chosen `from` and advance only the last year, or step one-year windows but say so. Do not advance to the next year until the current year's layer has arrived; pause automatically when the still-map fallback fires, with a "Resume" button. Keep `from` in the URL on every step.

### B5. First paint of the Explore map (delegated)

**Reproduce.** At 1280×900, 10 s after load the map area still reads "Loading the map layers for the selected year"; after about 20 s it falls back to the still map. WebGL is available in the test browser (`canvas.getContext('webgl')` is truthy). One console 404 on every load. Already assigned to the Explore first-paint agent; nothing to add except that the fallback timer should not fire during Play (B4).

### B6. Play/Pause accessible name

**Reproduce.** While playing, the visible text is "Pause" but an accessibility search for "Pause" finds no control and the only match remains `button "Play through the years"`. Likely the `aria-label` is static. Needs a check in `components/explore/ExploreYearControl.tsx`.

**Fix.** Set `aria-label` from the same state as the visible text, or drop the `aria-label` and let the text be the name.

### B7. Whitespace query

**Reproduce.** `/en/search?q=` shows "Enter a province, riding, or community." `/en/search?q=%20%20` shows the Unknown panel: "No released place, riding, or community record matches this query."

**Fix.** Trim `q` before branching; treat empty-after-trim as empty.

### B8. Search results that are a wall of Unknowns

**Reproduce.** `/en/search?q=montreal`. The Québec ridings matching "Montréal" each print "Whole riding: Loss unknown; 100% of the forest is unknown", one after another, with no way to tell them apart except the name.

**Fix.** Sort covered places first. Group the uncovered ones into one line, "N ridings match 'montreal' but have no satellite coverage, so their loss is Unknown", expandable to the list. Reword the row itself: "Not covered by the satellite record" is clearer than "100% of the forest is unknown".

### B9. Compare rankings

**Reproduce.** `/en/compare`. Note under the rankings: "Matching to official records hasn't been done for ridings yet, so it is Unknown in every row." Then: "36 of 280 federal ridings are ranked. Of the rest, 165 were not mapped at all, 67 were only partly mapped, and 12 have less than 500 hectares of forest." Elsewhere the site says there are 343 federal ridings.

**Fix.** Remove a column that cannot vary until the data exists; keep the sentence in the limitations list. Add "280 of the 343 ridings touch the four provinces" so the two totals reconcile.

### B10. Routing hygiene

**Reproduce.** `/fr/explore` 404, `/en/explorer` 404, `/EN` 404, `/en/Explore` 404, `/favicon.ico` 404 (the icon is served from the Next metadata route, so browsers that request the legacy path get nothing), no `/.well-known/security.txt`, no web manifest.

**Fix.** A small middleware: lowercase the path, and when a path matches the other locale's slug in `PUBLIC_LOCALE_ROUTE_PAIRS`, 308 to the right locale. Serve `/favicon.ico` as a static file. `security.txt` needs a contact address from the owner, which is the same gate as the corrections and dispute mailboxes.

### B11. Chart builder parameters

Same as B1 for `/en/data/harvest-and-fire`: invalid province or year values fall back to defaults with no message. Apply the B1 pattern.

## UI/UX proposals

1. **Explore on a phone.** At 375 px the reader scrolls past the mode tabs, the Boundaries panel, both year selects, Play and the full explanatory copy before reaching the map. Put the map first on narrow screens, with a sticky one-line readout ("2021–2022 · 1,352,468 ha lost") above it, and collapse Boundaries and "What these figures can't tell you" behind disclosure buttons that are closed by default on narrow screens only.
2. **Year selection.** Two 38-option selects plus Play is three controls for one idea. A dual-handle range input (`<input type=range>` ×2 with the span drawn between them) with the selects kept as the accessible fallback would make the span visible at a glance. The "Years shown: Change between 2021 and 2022" line is good; keep it next to the map, not only above the controls.
3. **The still-map fallback.** The message is clear, but it lands in the middle of the page with no indication that the figures on the right are still live. Add "The figures on this page are unaffected" (already there) in the same box as a "Retry" button and show the fallback as an inline notice, not a map-sized blank.
4. **Compare page weight.** The HTML is 452 KB because every ranking row is server-rendered. Render the two chosen places and the first 20 ranking rows; load the rest on "Show all". Pairs with the typeahead work.
5. **Search results.** See B8. Also show the place type as a small label before the name (Riding · Community · Economic region) so the reader can scan.
6. **Official-source comparison table.** About 130 rows with no filter or sticky header. Add a province filter, a sticky `<thead>`, and a direct CSV link beside the caption (the Data page already publishes the file).
7. **Header "Menu" at 800 px.** The collapsed menu appears at tablet width where there is room for the six links. Raise the breakpoint so the full nav shows from about 760 px.
8. **Home empty submit.** Submitting "Open the record" with an empty field navigates to the search page that then asks for a place. Keep the reader on the home page: focus the field and show the hint inline. Do not add `required`, which blocks screen-reader users with a generic browser message.
9. **"Four provinces" card on home.** "Both are minimums" is the most important sentence on the page and is the smallest text. Move it to the first line under the two figures.
10. **About page.** The rewrite on `worktree-agent-a390b4324f86b67a1` (audited today, passes) now lists what the record answers with links, which addresses the earlier "how many trees are left" promise.

## What this audit did not cover

- Tapping a riding on a touch screen: the interactive map never rendered in the test browser within the fallback window, so the "Point at or tap a district" readout was not exercised on touch. The copy already names tapping.
- Keyboard traversal of the full Explore control set and focus visibility.
- Lighthouse or axe runs; `npm run check:accessibility` covers the static rules only.
- The DOI link on the Wildfire page returns 403 to a scripted request; that is the publisher's bot blocking, not a broken link.

## Suggested order

B5 (delegated) → B1/B11 (one parser change) → B4 and B6 (one component) → B2 (with the typeahead branch) → B3 → B8 → B7 → B9 → B10. UX items 1, 2 and 4 are the ones a first-time visitor would notice.
